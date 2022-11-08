use wasm_bindgen::prelude::*;

const SOLVE_ITERATIONS: i32 = 100;
const MARGIN: f32 = 0.2;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

type Node = u32;

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
enum EdgeKind {
    Stack,
    Arc,
    Jump,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Edge {
    from: Node,
    to:   Node,
    kind: EdgeKind,
}

#[wasm_bindgen]
pub struct Graph {
    box_aspect_ratio: f32,
    node_count:       usize,
    edges:            Vec<Edge>,
    layout:           Vec<(f32, f32)>,
}

fn random(counter: &mut u64) -> f32 {
    let mut x: u64 = *counter;
    for _ in 0..4 {
        x *= 0x243f6a8885a308d3;
        x ^= x >> 37;
    }
    *counter += 1;
    //return 0.37;
    (x as u32) as f32 / (u32::MAX as f32)
}

fn soften(x: f32) -> f32 {
    let m = x.abs();
    x * m.powf(-0.5)
}

#[wasm_bindgen]
impl Graph {
    fn new(box_aspect_ratio: f32, node_count: usize, edges: Vec<Edge>) -> Self {
        let mut layout = vec![];
        for i in 0..node_count {
            let i = i as f32;
            // Break symmetries a little bit.
            layout.push((i * 0.01, (i + i.sin()) * 0.01));
        }
        Self {
            box_aspect_ratio,
            node_count,
            edges,
            layout,
        }
    }

    pub fn solve(
        &mut self,
        step_count: i32,
        bounding_box_x: f32,
        bounding_box_y: f32,
        output: &mut [f32],
        node_flags: &mut [u8],
        stack_index_output: &mut [u32],
    ) {
        let mut counter: u64 = 1;
        // First we figure out which groups are glued together as stacks.
        // A gets glued on top of B if A has a single outgoing Stack edge, just to B.
        #[derive(Clone, Debug)]
        enum OutboundState {
            Zero,
            One(Node),
            Many,
        }
        // Figure out how many outbound Stack edges each node has.
        let mut outbound_states: Vec<OutboundState> = vec![OutboundState::Zero; self.node_count];
        for edge in &self.edges {
            if let EdgeKind::Stack = edge.kind {
                match outbound_states[edge.from as usize] {
                    OutboundState::Zero => {
                        outbound_states[edge.from as usize] = OutboundState::One(edge.to)
                    }
                    OutboundState::One(_) => {
                        outbound_states[edge.from as usize] = OutboundState::Many
                    }
                    OutboundState::Many => (),
                }
            }
        }
        // Figure out who is the beginning of a stack (potentially one of length 1).
        let mut top_of_stack: Vec<bool> = vec![true; self.node_count];
        let mut bottom_of_stack: Vec<bool> = vec![true; self.node_count];
        for (from, outbound_state) in outbound_states.iter().enumerate() {
            if let OutboundState::One(to) = outbound_state {
                top_of_stack[*to as usize] = false;
                bottom_of_stack[from] = false;
            }
        }
        // Compile the stacks.
        type StackIndex = usize;
        let mut stacks: Vec<Vec<Node>> = vec![];
        let mut node_which_stack: Vec<StackIndex> = vec![StackIndex::MAX; self.node_count];
        let mut node_index_within_stack: Vec<usize> = vec![usize::MAX; self.node_count];
        for i in 0..self.node_count {
            if top_of_stack[i] {
                let mut stack = vec![i as Node];
                let mut current: Node = i as Node;
                loop {
                    node_which_stack[current as usize] = stacks.len();
                    node_index_within_stack[current as usize] = stack.len() - 1;
                    match outbound_states[current as usize] {
                        OutboundState::Zero => break,
                        OutboundState::One(to) => {
                            stack.push(to);
                            current = to;
                        }
                        OutboundState::Many => break,
                    }
                }
                stacks.push(stack);
            }
        }
        // We now produce setup position information for each stack.
        let mut stack_positions: Vec<(f32, f32)> = vec![(0.0, 0.0); stacks.len()];
        let mut stack_forces: Vec<(f32, f32)> = vec![(0.0, 0.0); stacks.len()];
        type SortedIndex = usize;
        let mut x_sorted_stack_indices: Vec<StackIndex> = (0..stacks.len()).collect();
        // Break symmetries slightly.
        for i in 0..stacks.len() {
            let x = i as f32;
            stack_positions[i] = (x * 0.01, (x + x.sin()) * 0.01);
        }
        // We now iteratively solve.
        for step_number in 0..step_count {
            let lerp = step_number as f32 / step_count as f32;
            //log("========================== step");
            // Zero the stack forces array.
            let noise_scale = 3.0 * (1.0 - lerp).powf(3.0);
            // log(&format!("step: {} noise_scale: {}", step_number, noise_scale));
            for force in &mut stack_forces {
                let rx = random(&mut counter) * noise_scale;
                let ry = random(&mut counter) * noise_scale;
                *force = (noise_scale * rx, noise_scale * ry);
                //*force = (0.0, 0.0);
            }

            // === Step 1: Collision detection between stacks.
            // First we sort all stacks by x coordinate for use in our broadphase.
            x_sorted_stack_indices.sort_by(|a, b| {
                let a = stack_positions[*a];
                let b = stack_positions[*b];
                a.0.partial_cmp(&b.0).unwrap_or_else(|| {
                    log(&format!("Bad comparison: a: {:?} b: {:?}", a, b));
                    panic!("bad comparison")
                })
            });
            // log(&format!("x_sorted_stack_indices: {:?}", x_sorted_stack_indices));
            // Perform the broadphase and resolve.
            for sorted_index in 0..x_sorted_stack_indices.len() {
                // Find the minimum and maximum sorted indices that can overlap with us.
                let mut min_other_stack: SortedIndex = sorted_index;
                while min_other_stack > 0
                    && stack_positions[x_sorted_stack_indices[min_other_stack - 1]].0
                        > stack_positions[x_sorted_stack_indices[sorted_index]].0 - 1.0 - MARGIN
                {
                    min_other_stack -= 1;
                }
                let mut max_other_stack: SortedIndex = sorted_index;
                while max_other_stack < stacks.len() - 1
                    && stack_positions[x_sorted_stack_indices[max_other_stack + 1]].0
                        < stack_positions[x_sorted_stack_indices[sorted_index]].0 + 1.0 + MARGIN
                {
                    max_other_stack += 1;
                }
                // log(&format!(
                //     "sorted-stack {} (stack {}) ranges from {} to {}",
                //     sorted_index,
                //     x_sorted_stack_indices[sorted_index],
                //     min_other_stack,
                //     max_other_stack
                // ));
                // Resolve all overlaps.
                for them_sorted_index in min_other_stack..=max_other_stack {
                    if sorted_index == them_sorted_index {
                        continue;
                    }
                    let us_stack: StackIndex = x_sorted_stack_indices[sorted_index];
                    let them_stack: StackIndex = x_sorted_stack_indices[them_sorted_index];
                    let us_position = stack_positions[us_stack];
                    let them_position = stack_positions[them_stack];
                    let us_height = stacks[us_stack].len() as f32;
                    let them_height = stacks[them_stack].len() as f32;
                    // Perform the final narrowphase (simple AABB check), just checking y.
                    let us_top_y = us_position.1 - us_height / 2.0;
                    let us_bottom_y = us_position.1 + us_height / 2.0;
                    let them_top_y = them_position.1 - them_height / 2.0;
                    let them_bottom_y = them_position.1 + them_height / 2.0;
                    if us_top_y > them_bottom_y + MARGIN || them_top_y > us_bottom_y + MARGIN {
                        continue;
                    }
                    // We have an overlap. We now must resolve it.
                    let (dx, dy) = (
                        them_position.0 - us_position.0,
                        them_position.1 - us_position.1,
                    );
                    let distance = 1e-6 + (dx * dx + dy * dy).sqrt();
                    let (unit_dx, unit_dy) = (dx / distance, dy / distance);
                    // For scaling the force we scale down y differences to account for height.
                    let scaled_dy = dy / (us_height + them_height) / 2.0;
                    let scaled_distance = (dx * dx + scaled_dy * scaled_dy).sqrt();
                    //log(&format!(
                    //   "Collision between stacks {} (at {:?}) and {} (at {:?}) dist={} scaled_dist={}",
                    //   us_stack, us_position, them_stack, them_position, distance, scaled_distance
                    //));
                    let time_scaling = (1.0 - lerp).powf(0.3);
                    let time_scaling_weak = (1.0 - lerp).powf(2.0);
                    let force = (1.415 - scaled_distance) * 0.1;
                    stack_forces[us_stack].0 -= unit_dx * force * 2.0 * time_scaling;
                    stack_forces[us_stack].1 -= unit_dy * force * time_scaling_weak;
                    stack_forces[them_stack].0 += unit_dx * force * 2.0 * time_scaling;
                    stack_forces[them_stack].1 += unit_dy * force * time_scaling_weak;
                }
            }

            // === Step 2: Pull on Arc edges.
            for edge in &self.edges {
                match edge.kind {
                    EdgeKind::Arc | EdgeKind::Stack => {
                        // Figure out the positions of the two nodes.
                        let from_stack = node_which_stack[edge.from as usize];
                        let to_stack = node_which_stack[edge.to as usize];
                        if from_stack == to_stack {
                            continue;
                        }
                        let from_stack_len = stacks[from_stack].len();
                        let to_stack_len = stacks[to_stack].len();
                        let from_stack_index_within = node_index_within_stack[edge.from as usize];
                        let to_stack_index_within = node_index_within_stack[edge.to as usize];
                        //log(&format!(
                        //    "from-stack={} to-stack={}",
                        //    from_stack, to_stack
                        //));
                        let mut from_position = stack_positions[from_stack];
                        from_position.1 +=
                            (from_stack_len - 1) as f32 / -2.0 + from_stack_index_within as f32;
                        let mut to_position = stack_positions[to_stack];
                        to_position.1 +=
                            (to_stack_len - 1) as f32 / -2.0 + to_stack_index_within as f32;
                        // There are two cases:
                        // If we are the bottom of a stack then we want to pull their x to be directly on us.
                        // If we aren't the bottom of a stack then we want to pull their x to be 1.25 on either side of us.
                        // Always pull their y to be exactly 1.25 below us.
                        let (dx, dy) = (
                            to_position.0 - from_position.0,
                            to_position.1 - from_position.1,
                        );
                        let target_distance = 1.25 * lerp.powf(0.5);
                        let force_x = 0.2
                            * match (bottom_of_stack[edge.from as usize], dx > 0.0) {
                                (true, _) => soften(-dx),
                                (_, true) => soften(target_distance - dx),
                                (_, false) => soften(-target_distance - dx),
                            };
                        let target_vert_spacing = match bottom_of_stack[edge.from as usize] {
                            true => 1.25,
                            false => 1.0,
                        };
                        let force_y = 0.2 * (target_vert_spacing - dy);
                        stack_forces[from_stack].0 -= force_x * (1.0 - lerp);
                        stack_forces[from_stack].1 -= force_y * (1.0 - lerp);
                        stack_forces[to_stack].0 += force_x * (1.0 - lerp);
                        stack_forces[to_stack].1 += force_y * (1.0 - lerp);
                    }
                    EdgeKind::Jump => {}
                }
            }

            // === Step 3: Move the stacks.
            for i in 0..stacks.len() {
                let (x, y) = stack_positions[i];
                let (fx, fy) = stack_forces[i];
                // We cap the movement for stability reasons.
                let (fx, fy) = (fx.clamp(-1.0, 1.0), fy.clamp(-1.0, 1.0));
                //log(&format!("[3] Stack {} at ({}, {}) with force ({}, {})", i, x, y, fx, fy));
                stack_positions[i] = (x + fx, y + fy);
            }

            // === Step 4: Subtract out the CoM, unless we're in the last half of steps.
            if true || step_number <= step_count / 2 {
                let mut com_x = 0.0;
                let mut com_y = 0.0;
                let mut total_weight = 0.0;
                for i in 0..stacks.len() {
                    let (x, y) = stack_positions[i];
                    let weight = stacks[i].len() as f32;
                    com_x += x * weight;
                    com_y += y * weight;
                    total_weight += weight;
                }
                com_x /= total_weight;
                com_y /= total_weight;
                for i in 0..stacks.len() {
                    stack_positions[i].0 -= com_x;
                    stack_positions[i].1 -= com_y;
                }
            }

            // === Step 4: Enforce the bounding box.
            for i in 0..stacks.len() {
                let (x, y) = stack_positions[i];
                // TODO: Implement this.
            }
        }
        // Finally, we compute the layout based on the stack positions.
        for (stack, stack_position) in stacks.iter().zip(stack_positions.iter()) {
            let (x, y) = *stack_position;
            for (i, node) in stack.iter().enumerate() {
                self.layout[*node as usize] = (
                    x * self.box_aspect_ratio,
                    y + i as f32 - (stack.len() - 1) as f32 / 2.0,
                );
            }
        }

        // Final step: Center by AABB.
        // TODO: Implement this.

        // Output the layout and flags.
        for i in 0..self.node_count {
            let (x, y) = self.layout[i];
            output[i * 2 + 0] = x - 0.5;
            output[i * 2 + 1] = y - 0.5;
            node_flags[i] = top_of_stack[i] as u8 | (bottom_of_stack[i] as u8) << 1;
            stack_index_output[i] = node_which_stack[i] as u32;
        }

        log(&format!("DONE 9"));
    }
}

#[wasm_bindgen]
pub fn create_graph(box_aspect_ratio: f32, edges: JsValue) -> Graph {
    let edges: Vec<Edge> = serde_wasm_bindgen::from_value(edges).unwrap();
    let mut maximum_node: i64 = -1;
    for edge in &edges {
        maximum_node = maximum_node.max(edge.from as i64).max(edge.to as i64);
    }
    Graph::new(box_aspect_ratio, (maximum_node + 1) as usize, edges)
}
