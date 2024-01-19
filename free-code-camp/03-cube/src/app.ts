import shader from 'bundle-text:./shader.wgsl';
import cubeData from './cube';
import { mat4 } from 'wgpu-matrix';
import type { Vec3, Mat4 } from 'wgpu-matrix';

function createTransforms(modelMat: Mat4, translation: Vec3 = [0, 0, 0], rotation: Vec3 = [0, 0, 0], scaling: Vec3 = [1, 1, 1]) {
  // Create individual transformation matrices
  const translateMat = mat4.translation(translation);
  const rotateXMat = mat4.rotationX(rotation[0]);
  const rotateYMat = mat4.rotationY(rotation[1]);
  const rotateZMat = mat4.rotationZ(rotation[2]);
  const scaleMat = mat4.scaling(scaling);

  // Combine all transformation matrices together to form a final transform matrix: modelMat
  modelMat = mat4.multiply(translateMat, rotateZMat);
  modelMat = mat4.multiply(modelMat, rotateYMat);
  modelMat = mat4.multiply(modelMat, rotateXMat);
  modelMat = mat4.multiply(modelMat, scaleMat);

  return modelMat;
}

function createViewProjection(respectRatio = 1.0, cameraPosition: Vec3 = [2, 2, 4], lookDirection: Vec3 = [0, 0, 0],
  upDirection: Vec3 = [0, 1, 0]) {

  const viewMatrix = mat4.lookAt(cameraPosition, lookDirection, upDirection);
  const projectionMatrix = mat4.perspective(2 * Math.PI / 5, respectRatio, 0.1, 100.0);
  const viewProjectionMatrix = mat4.multiply(projectionMatrix, viewMatrix);

  const cameraOption = {
    eye: cameraPosition,
    center: lookDirection,
    zoomMax: 100,
    zoomSpeed: 2
  };

  return {
    viewMatrix,
    projectionMatrix,
    viewProjectionMatrix,
    cameraOption
  }
}

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
    alphaMode: 'premultiplied',
  });
  return { device, canvas, context, format } as const;

}

function createGPUBufferUint(device: GPUDevice, data: Uint32Array,
  usageFlag: GPUBufferUsageFlags = GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST) {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: usageFlag,
    mappedAtCreation: true
  });
  new Uint32Array(buffer.getMappedRange()).set(data);
  buffer.unmap();
  return buffer;
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

  const numberOfVertices = cubeData.positions.length / 3;
  const vertexBuffer = createGpuBuffer(gpu.device, cubeData.positions);
  const colorBuffer = createGpuBuffer(gpu.device, cubeData.colors);

  const pipeline = gpu.device.createRenderPipeline({
    vertex: {
      module: gpu.device.createShaderModule({
        code: shader
      }),
      entryPoint: "vs_main",
      buffers: [
        {
          // position
          arrayStride: 4 * 3,
          attributes: [{
            shaderLocation: 0,
            offset: 0,
            format: "float32x3"
          }]
        },
        {
          // color
          arrayStride: 4 * 3,
          attributes: [{
            shaderLocation: 1,
            offset: 0,
            format: "float32x3"
          }]
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
      topology: "triangle-list",
      cullMode: 'back'
    },
    depthStencil: {
      format: "depth24plus",
      depthWriteEnabled: true,
      depthCompare: "less"
    },

    layout: "auto"
  });

  // create uniform buffer and bind group
  const uniformBuffer = gpu.device.createBuffer({
    size: 4 * 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  const depthTexture = gpu.device.createTexture({
    size: [gpu.canvas.width, gpu.canvas.height],
    format: "depth24plus",
    usage: GPUTextureUsage.RENDER_ATTACHMENT
  });

  const bindGroup = gpu.device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: uniformBuffer,
          offset: 0,
          size: 64
        }
      }
    ]
  });

  const textureView = gpu.context.getCurrentTexture().createView();

  const renderPassDescription = {
    colorAttachments: [{
      view: textureView,
      clearValue: { r: 0.2, g: 0.247, b: 0.314, a: 1.0 }, //background color
      loadOp: 'clear',
      storeOp: 'store'
    }],
    depthStencilAttachment: {
      view: depthTexture.createView(),
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: "store",
    }
  } satisfies GPURenderPassDescriptor;

  let modelMatrix = createTransforms(mat4.create());
  const { viewProjectionMatrix } = createViewProjection(gpu.canvas.width / gpu.canvas.height);

  let mvpMatrix = mat4.multiply(viewProjectionMatrix, modelMatrix);

  gpu.device.queue.writeBuffer(uniformBuffer, 0, mvpMatrix as Float32Array);

  renderPassDescription.colorAttachments[0].view = gpu.context
    .getCurrentTexture()
    .createView();

  const commandEncoder = gpu.device.createCommandEncoder();
  const renderPass = commandEncoder.beginRenderPass(renderPassDescription);

  renderPass.setPipeline(pipeline);
  renderPass.setVertexBuffer(0, vertexBuffer);
  renderPass.setVertexBuffer(1, colorBuffer);
  renderPass.setBindGroup(0, bindGroup)
  renderPass.draw(numberOfVertices);
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

