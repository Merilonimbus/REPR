export default `

precision highp float;

// Attributes (vertex shader inputs)
in vec3 in_position;
in vec3 in_normal;
#ifdef USE_UV
  in vec2 in_uv;
#endif

// Varyings (vertex shader outputs)
out vec3 vNormalWS;
out vec3 vPositionWS;
out vec3 vDirectionWS;
#ifdef USE_UV
  out vec2 vUv;
#endif

// Uniforms
struct Camera
{
  mat4 WS_to_CS; // World-Space to Clip-Space (view * proj)
  vec3 position;
};
uniform Camera uCamera;

struct Model
{
  mat4 LS_to_WS; // Local-Space to World-Space
};
uniform Model uModel;

void main()
{
  vec4 positionLocal = vec4(in_position, 1.0);
  vec4 WS_position_4 = uModel.LS_to_WS * positionLocal;

  gl_Position = uCamera.WS_to_CS * WS_position_4;
  vNormalWS = normalize(in_normal);

  vPositionWS = vec3(WS_position_4);
  vDirectionWS = normalize(uCamera.position - vPositionWS);
}
`;
