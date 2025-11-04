export default `
precision highp float;

#define PI4 12.566370614359172953850573533118
#define PI 3.1415926535897932384626433832795

in vec3 vNormalWS;
in vec3 vPositionWS;
in vec3 vPosition;
in vec3 vDirectionWS;

// Fragment shader output
out vec4 outFragColor;

// Uniforms
struct Material
{
  vec3 albedo;
  float alpha;
  float f_0;
};

struct PointLight
{
    vec3 position;
    vec3 color;
    float intensity;
};

struct DirectionalLight
{
    vec3 direction;
    vec3 color;
    float intensity;
};

uniform int state;

uniform Material uMaterial;

uniform PointLight uPointLight1;
uniform PointLight uPointLight2;

uniform DirectionalLight uDirectionalLight;

uniform float k_d;
uniform float k_s;

uniform sampler2D specular_texture;
uniform sampler2D diffuse_texture;

// From three.js
vec4 sRGBToLinear( in vec4 value ) {
  return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}

// From three.js
vec4 LinearTosRGB( in vec4 value ) {
  return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}

vec3 get_radiance(PointLight point_light, vec3 WS_position)
{
  vec3 w_i = point_light.position - WS_position;
  float len_w_i = length(w_i);

  return point_light.color * dot(vNormalWS / (PI4 * pow(len_w_i, 2.)), w_i);
}

vec3 get_radiance(DirectionalLight directional_light, vec3 WS_position)
{

  return clamp(directional_light.color * dot(vNormalWS, directional_light.direction) / PI4, vec3(0), vec3(1));
}

vec3 ACESToneMapping(vec3 color) {
  float b = 0.03f;
  float c = 2.43f;
  float d = 0.59f;
  float e = 0.14f;
  float a = 2.51f;
  return (color*(a*color+b))/(color*(c*color+d)+e);
}

vec3 ReinhardToneMapping(vec3 color) {
  return color / (color + 1.);
}

//region BRDF
float D(vec3 h, float alpha){
  float alpha_2 = pow(alpha, 2.);
  return alpha_2 / (PI * pow(pow(dot(vNormalWS, h), 2.) * (alpha_2 - 1.) + 1., 2.));
}

float F(vec3 h, float f_0){
  return f_0 + (1. - f_0) * pow(1. - dot(vDirectionWS, h), 5.);
}

float G(vec3 w, float k) {
  float d = dot(vNormalWS, w);
  return d / (d * (1. - k) + k);
}

float get_specular(float alpha, float f_0, vec3 w_i) {
  vec3 h = normalize(w_i + vDirectionWS);
  float k = pow(alpha + 1., 2.) / 8.;
  float d = dot(vDirectionWS, vNormalWS) * dot(w_i, vNormalWS);
  if (d > 0.) {
    return D(h, alpha) * F(h, f_0) * G(w_i, k) * G(vDirectionWS, k) / (4. * d);
  } else {
    return 0.;
  }
}

vec3 get_difuse(vec3 albedo, vec3 w_i) {
  return albedo * dot(vNormalWS, w_i) / PI;
}

vec3 get_radiance_BRDF(vec3 light_color, float intensity, vec3 w_i, vec3 albedo, float k_d, float k_s) {
    return clamp(intensity * light_color * (k_d * clamp(get_difuse(albedo, w_i), 0., 1.) + k_s * clamp(get_specular(uMaterial.alpha, uMaterial.f_0, w_i), 0., 1.)), 0., 1.);
}

vec3 get_radiance_BRDF(PointLight point_light, Material material, vec3 albedo, float k_d, float k_s) {
    return get_radiance_BRDF(point_light.color, point_light.intensity, normalize(point_light.position - vPositionWS), albedo, k_d, k_s);
}

vec3 get_radiance_BRDF(DirectionalLight directional_light, Material material, vec3 albedo, float k_d, float k_s) {
    return get_radiance_BRDF(directional_light.color, directional_light.intensity, normalize(-directional_light.direction), albedo, k_d, k_s);
}
//endregion

//region IBL
vec3 RGBMDecode(vec4 rgbm) {
  return 6.0 * rgbm.rgb * rgbm.a;
}

vec2 cartesianToSpherical(vec3 cartesian) {
    // Compute azimuthal angle, in [-PI, PI]
    float phi = atan(cartesian.z, cartesian.x);
    // Compute polar angle, in [-PI/2, PI/2]
    float theta = asin(cartesian.y);
    return vec2(phi, theta);
}

vec2 get_textureCoo(vec2 textureCoo, float n) {
    return vec2(0., 1. - 1. / pow(2., n)) + textureCoo * vec2(1. / pow(2., n), 1. / pow(2., 1. + n));
}

vec3 get_radiance_BRDF_baked(vec3 albedo, float k_d, float k_s) {
  vec2 spherical = cartesianToSpherical(normalize(-reflect(vDirectionWS, vNormalWS)));

  vec2 textureCoo = clamp(((spherical / vec2(2. * PI, PI)) + 0.5), 0., 1.);
  vec3 diffuse = albedo * RGBMDecode(texture(diffuse_texture, textureCoo)) / PI;
  
  float n = min(uMaterial.alpha * 5., 5.);
  float n_ratio = fract(n);
  n = floor(n);
  vec2 textureCooN = get_textureCoo(textureCoo, n);
  vec2 textureCooNp1 = get_textureCoo(textureCoo, n + 1.);

  vec3 specular = (1. - n_ratio) * RGBMDecode(texture(specular_texture, textureCooN)) + n_ratio * RGBMDecode(texture(specular_texture, textureCooNp1));
  return (k_d * diffuse + k_s * specular); 
}
//endregion

void main()
{
  // **DO NOT** forget to do all your computation in linear space.
  vec3 albedo = sRGBToLinear(vec4(uMaterial.albedo, 1.0)).rgb;

  vec3 radiance = vec3(0.);

  switch(state) {
  case 0: // Warm up 1
    radiance = radiance + sRGBToLinear(vec4((vNormalWS + 1.0) / vec3(2), 1.0)).rgb;
    break;
  case 1: // Warm up 2
    radiance = radiance + sRGBToLinear(vec4((vDirectionWS + 1.0) / 2.0, 1.0)).rgb;
    break;
  case 2: // Diffuse BRDF
    radiance = radiance + get_radiance_BRDF(uPointLight1, uMaterial, albedo, k_d, 0.);
    radiance = radiance + get_radiance_BRDF(uPointLight2, uMaterial, albedo, k_d, 0.);
    radiance = radiance + get_radiance_BRDF(uDirectionalLight, uMaterial, albedo, k_d, 0.);

    radiance = ReinhardToneMapping(radiance);
    break;
  case 3: // Specular BRDF
    radiance = radiance + get_radiance_BRDF(uPointLight1, uMaterial, albedo, 0., k_s);
    radiance = radiance + get_radiance_BRDF(uPointLight2, uMaterial, albedo, 0., k_s);
    radiance = radiance + get_radiance_BRDF(uDirectionalLight, uMaterial, albedo, 0., k_s);

    radiance = ReinhardToneMapping(radiance);
    break;
  case 4: // Combined BRDF
    radiance = radiance + get_radiance_BRDF(uPointLight1, uMaterial, albedo, k_d, k_s);
    radiance = radiance + get_radiance_BRDF(uPointLight2, uMaterial, albedo, k_d, k_s);
    radiance = radiance + get_radiance_BRDF(uDirectionalLight, uMaterial, albedo, k_d, k_s);

    radiance = ReinhardToneMapping(radiance);
    break;
  case 5: // Diffuse IBL
    radiance = get_radiance_BRDF_baked(albedo, k_d, 0.);
    break;
  case 6: // Specular IBL
    radiance = get_radiance_BRDF_baked(albedo, 0., k_s);
    break;
  case 7: // Combined IBL
    radiance = get_radiance_BRDF_baked(albedo, k_d, k_s);
    break;
  }

  // **DO NOT** forget to apply gamma correction as last step.
  outFragColor.rgba = LinearTosRGB(vec4(radiance, 1.0));
}

`;