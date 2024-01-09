struct Fragment {
    @builtin(position) Position: vec4<f32>,
    @location(0) Color: vec4<f32>
};

@vertex
fn vs_main(@location(0) pos: vec4<f32>, @location(1) color: vec4<f32>) -> Fragment {

    var output: Fragment;
    output.Position = pos;
    output.Color = color;

    return output;
}

@fragment
fn fs_main(@location(0) Color: vec4<f32>) -> @location(0) vec4<f32> {
    return Color;
}
