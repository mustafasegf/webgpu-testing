import shader from 'bundle-text:./shader.wgsl';

async function initGpu() {
  const canvas = document.getElementById('canvas-webgpu') as HTMLCanvasElement;
  if (canvas) {
    const div = document.getElementById('canvas-container') as HTMLDivElement;
    if (div) {
      canvas.width = div.offsetWidth;
      canvas.height = div.offsetHeight;


      function windowResize() {
        canvas.width = div.offsetWidth;
        canvas.height = div.offsetHeight;
      };
      window.addEventListener('resize', debounce(windowResize, 100));
    }
  }
  const adapter = await navigator.gpu?.requestAdapter() as GPUAdapter;
  const device = await adapter?.requestDevice() as GPUDevice;
  const context = canvas.getContext('webgpu') as GPUCanvasContext;
  const format = 'bgra8unorm';

  context.configure({
    device: device,
    format: format,
  });
  return { device, canvas, context, format } as const;

}

function createGpuBuffer(
  device: GPUDevice,
  data: Float32Array,
  usageFlag: GPUBufferUsageFlags = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
) {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: usageFlag,
    mappedAtCreation: true
  });

  new Float32Array(buffer.getMappedRange()).set(data);
  buffer.unmap();
  return buffer;
}

async function main() {

  const gpu = await initGpu();

  console.log('drawing canvas');


  const vertexData = new Float32Array([
    -0.5, -0.5,  // vertex a
    0.5, -0.5,  // vertex b
    -0.5, 0.5,  // vertex d
    -0.5, 0.5,  // vertex d
    0.5, -0.5,  // vertex b
    0.5, 0.5,  // vertex c
  ]);

  const colorData = new Float32Array([
    1, 0, 0,    // vertex a: red
    0, 1, 0,    // vertex b: green
    1, 1, 0,    // vertex d: yellow
    1, 1, 0,    // vertex d: yellow
    0, 1, 0,    // vertex b: green
    0, 0, 1     // vertex c: blue
  ]);

  const vertexBuffer = createGpuBuffer(gpu.device, vertexData);
  const colorBuffer = createGpuBuffer(gpu.device, colorData);

  const bindGroupLayout = gpu.device.createBindGroupLayout({
    entries: [],
  });

  const bindGroup = gpu.device.createBindGroup({
    layout: bindGroupLayout,
    entries: []
  });

  const pipelineLayout = gpu.device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout]
  });

  const pipeline = gpu.device.createRenderPipeline({
    vertex: {
      module: gpu.device.createShaderModule({
        code: shader
      }),
      entryPoint: "vs_main",
      buffers: [
        {
          arrayStride: 4 * 2,
          attributes: [
            {
              shaderLocation: 0,
              offset: 0,
              format: "float32x2"
            }
          ]
        },
        {
          arrayStride: 4 * 3,
          attributes: [
            {
              shaderLocation: 1,
              offset: 0,
              format: "float32x3"
            }
          ]
        }
      ]
    },

    fragment: {
      module: gpu.device.createShaderModule({
        code: shader
      }),
      entryPoint: "fs_main",
      targets: [{
        format: gpu.format
      }]
    },

    primitive: {
      topology: "triangle-list"
    },

    layout: pipelineLayout
  });

  const commandEncoder = gpu.device.createCommandEncoder();
  const textureView = gpu.context.getCurrentTexture().createView();
  const renderPass = commandEncoder.beginRenderPass({
    colorAttachments: [{
      view: textureView,
      clearValue: { r: 0.2, g: 0.247, b: 0.314, a: 1.0 }, //background color
      loadOp: 'clear',
      storeOp: 'store'
    }]
  });

  renderPass.setPipeline(pipeline);
  renderPass.setVertexBuffer(0, vertexBuffer);
  renderPass.setVertexBuffer(1, colorBuffer);
  renderPass.setBindGroup(0, bindGroup)
  renderPass.draw(6);
  renderPass.end();

  gpu.device.queue.submit([commandEncoder.finish()]);
}


export function debounce<T extends (...args: any[]) => any>(cb: T, wait: number) {
  let h: any;
  const callable = (...args: any) => {
    clearTimeout(h);
    h = setTimeout(() => cb(...args), wait);
  };
  return <T>(<any>callable);
}

window.addEventListener("load", () => {
  main();
  window.addEventListener('resize', () => {
    debounce(main, 100);
  });
})

