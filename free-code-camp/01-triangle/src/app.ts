import shader from 'bundle-text:./shader.wgsl';

async function main() {
  console.log('drawing canvas');

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

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [],
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: []
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout]
  });

  const pipeline = device.createRenderPipeline({
    vertex: {
      module: device.createShaderModule({
        code: shader
      }),
      entryPoint: "vs_main"
    },

    fragment: {
      module: device.createShaderModule({
        code: shader
      }),
      entryPoint: "fs_main",
      targets: [{
        format: format
      }]
    },

    primitive: {
      topology: "triangle-list"
    },

    layout: pipelineLayout
  });

  const commandEncoder = device.createCommandEncoder();
  const textureView = context.getCurrentTexture().createView();
  const renderPass = commandEncoder.beginRenderPass({
    colorAttachments: [{
      view: textureView,
      clearValue: { r: 0.2, g: 0.247, b: 0.314, a: 1.0 }, //background color
      loadOp: 'clear',
      storeOp: 'store'
    }]
  });

  renderPass.setPipeline(pipeline);
  renderPass.setBindGroup(0, bindGroup)
  renderPass.draw(3, 1, 0, 0);
  renderPass.end();

  device.queue.submit([commandEncoder.finish()]);
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

