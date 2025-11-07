import { GUI } from 'dat.gui';
import { mat4, vec3 } from 'gl-matrix';
import { Camera } from './camera';
import { SphereGeometry } from './geometries/sphere';
import { GLContext } from './gl';
import { PBRShader } from './shader/pbr-shader';
import { Texture, Texture2D } from './textures/texture';
import { UniformType } from './types';

enum RenderState {
  WarmUp1 = 0,
  WarmUp2,
  Diffuse_BRDF,
  Specular_BRDF,
  Combined_BRDF,
  Diffuse_IBL,
  Specular_IBL,
  Combined_IBL
}

// GUI elements
interface GUIProperties {
  albedo: number[];
  state: RenderState;
  pointLight1On: boolean
  pointLight2On: boolean;
  directionalLightOn: boolean;
}

/**
 * Class representing the current application with its state.
 *
 * @class Application
 */
class Application {
  private _context: GLContext; // Context used to draw to the canvas
  private _shader: PBRShader;
  private _geometry: SphereGeometry;
  private _uniforms: Record<string, UniformType | Texture>;
  private _textureExample: Texture2D<HTMLElement> | null;
  private _camera: Camera;
  private _guiProperties: GUIProperties; // Object updated with the properties from the GUI


  constructor(canvas: HTMLCanvasElement) {
    this._context = new GLContext(canvas);
    this._camera = new Camera(0., 0., 18.);
    this._geometry = new SphereGeometry();
    this._shader = new PBRShader();
    this._textureExample = null;
    this._uniforms = {
      'step': 0,
      'uMaterial.albedo': vec3.create(),
      'uMaterial.alpha': 0.1,
      'uMaterial.metallicity': 1.,
      'uCamera.position': vec3.create(),
      'uModel.LS_to_WS': mat4.create(),
      'uCamera.WS_to_CS': mat4.create(),
      'uPointLight1.position': vec3.create(),
      'uPointLight1.color': vec3.create(),
      'uPointLight1.intensity': 1.,
      'uPointLight2.position': vec3.create(),
      'uPointLight2.color': vec3.create(),
      'uPointLight2.intensity': 1.,
      'uDirectionalLight.direction': vec3.create(),
      'uDirectionalLight.color': vec3.create(),
      'uDirectionalLight.intensity': 1.,
      'specular_texture': Texture2D.prototype,
      'diffuse_texture': Texture2D.prototype,
      'state': 0.,
    };

    // Set GUI default values
    this._guiProperties = {
      albedo: [255, 255, 255],
      state: RenderState.WarmUp1,
      pointLight1On: false,
      pointLight2On: false,
      directionalLightOn: true,
    };

    const states = {
        "Warm up 1": RenderState.WarmUp1,
        "Warm up 2": RenderState.WarmUp2,
        "Diffuse BRDF": RenderState.Diffuse_BRDF,
        "Specular BRDF": RenderState.Specular_BRDF,
        "Combined BRDF": RenderState.Combined_BRDF,
        "Diffuse IBL": RenderState.Diffuse_IBL,
        "Specular IBL": RenderState.Specular_IBL,
        "Combined IBL": RenderState.Combined_IBL,
    };

    // Creates a GUI floating on the upper right side of the page.
    // You are free to do whatever you want with this GUI.
    // It's useful to have parameters you can dynamically change to see what happens.
    const gui = new GUI();
    gui.addColor(this._guiProperties, 'albedo');
    
    gui.add(this._guiProperties, 'state', states)
    .name('Render State')
    .onChange((v: RenderState) => {
        this._uniforms['state'] = v;
    });

    gui.add(this._guiProperties, 'pointLight1On');
    gui.add(this._guiProperties, 'pointLight2On');
    gui.add(this._guiProperties, 'directionalLightOn');
  }

  /**
   * Initializes the application.
   */
  async init() {
    this._context.uploadGeometry(this._geometry);
    this._context.compileProgram(this._shader);

    // Example showing how to load a texture and upload it to GPU.
    this._textureExample = await Texture2D.load(
      'assets/ggx-brdf-integrated.png'
    );

    const diffuse_texture = await Texture2D.load(
      'assets/env/Alexs_Apt_2k-diffuse-RGBM.png'
    )
    const specular_texture = await Texture2D.load(
      'assets/env/Alexs_Apt_2k-specular-RGBM.png'
    )

    if (diffuse_texture instanceof Texture) {
      this._context.uploadTexture(diffuse_texture)
      this._uniforms['diffuse_texture'] = diffuse_texture
    }
    if (specular_texture instanceof Texture) {
      this._context.uploadTexture(specular_texture)
      this._uniforms['specular_texture'] = specular_texture
    }

    if (this._textureExample !== null) {
      this._context.uploadTexture(this._textureExample);
      // You can then use it directly as a uniform:
      // ```uniforms.myTexture = this._textureExample;```
    }

    // Handle keyboard and mouse inputs to translate and rotate camera.
    canvas.addEventListener('keydown', this._camera.onKeyDown.bind(this._camera), true);
    canvas.addEventListener('pointerdown', this._camera.onPointerDown.bind(this._camera), true);
    canvas.addEventListener('pointermove', this._camera.onPointerMove.bind(this._camera), true);
    canvas.addEventListener('pointerup', this._camera.onPointerUp.bind(this._camera), true);
    canvas.addEventListener('pointerleave', this._camera.onPointerUp.bind(this._camera), true);
  }

  /**
   * Called at every loop, before the [[Application.render]] method.
   */
  update() {
    /** Empty. */
  }

  /**
   * Called when the canvas size changes.
   */
  resize() {
    this._context.resetViewport();
  }

  /**
   * Called at every loop, after the [[Application.update]] method.
   */
  render() {
    this._context.clear();
    this._context.setDepthTest(true);

    const props = this._guiProperties;

    // Set the albedo uniform using the GUI value
    this._uniforms['uMaterial.albedo'] = vec3.fromValues(
      props.albedo[0] / 255,
      props.albedo[1] / 255,
      props.albedo[2] / 255);
    this._uniforms['uMaterial.alpha'] = .5;
    this._uniforms['uMaterial.metallicity'] = 1.;
    this._uniforms['uCamera.position'] = this._camera._position;
    this._uniforms['uPointLight1.position'] = vec3.fromValues(
      10, 10, 2.5
    );
    this._uniforms['uPointLight1.color'] = vec3.fromValues(1., .5, 0.);
    this._uniforms['uPointLight1.intensity'] = props.pointLight1On ? 1. : 0.;
    this._uniforms['uPointLight2.position'] = vec3.fromValues(
      -10, -10, 2.5
    );
    this._uniforms['uPointLight2.color'] = vec3.fromValues(0., .5, 1.);
    this._uniforms['uPointLight2.intensity'] = props.pointLight2On ? 1. : 0.;
    this._uniforms['uDirectionalLight.direction'] = vec3.fromValues(
      0., -1., -1.
    );
    this._uniforms['uDirectionalLight.color'] = vec3.fromValues(1., 1., 1.);
    this._uniforms['uDirectionalLight.intensity'] = props.directionalLightOn ? 1. : 0.;


    // Set World-Space to Clip-Space transformation matrix (a.k.a view-projection).
    const aspect = this._context.gl.drawingBufferWidth / this._context.gl.drawingBufferHeight;
    let WS_to_CS = this._uniforms['uCamera.WS_to_CS'] as mat4;
    mat4.multiply(WS_to_CS, this._camera.computeProjection(aspect), this._camera.computeView());

    // Draw the 5x5 grid of spheres
    const rows = 5;
    const columns = 5;
    const spacing = this._geometry.radius * 2.5;
    for (let r = 0; r < rows; ++r) {
      for (let c = 0; c < columns; ++c) {

        // Set Local-Space to World-Space transformation matrix (a.k.a model).
        const WsSphereTranslation = vec3.fromValues(
          (c - columns * 0.5) * spacing + spacing * 0.5,
          (r - rows * 0.5) * spacing + spacing * 0.5,
          0.0
        );
        const LS_to_WS = this._uniforms["uModel.LS_to_WS"] as mat4;
        mat4.fromTranslation(LS_to_WS, WsSphereTranslation);


        this._uniforms['uMaterial.metallicity'] = r / (rows - 1);
        this._uniforms['uMaterial.alpha'] = (c + 1) / (columns + 1);

        // Draw the triangles
        this._context.draw(this._geometry, this._shader, this._uniforms);
      }
    }
  }
}

const canvas = document.getElementById('main-canvas') as HTMLCanvasElement;
const app = new Application(canvas as HTMLCanvasElement);
app.init();

function animate() {
  app.update();
  app.render();
  window.requestAnimationFrame(animate);
}
animate();

/**
 * Handles resize.
 */
const resizeObserver = new ResizeObserver((entries) => {
  if (entries.length > 0) {
    const entry = entries[0];
    canvas.width = window.devicePixelRatio * entry.contentRect.width;
    canvas.height = window.devicePixelRatio * entry.contentRect.height;
    app.resize();
  }
});

resizeObserver.observe(canvas);
