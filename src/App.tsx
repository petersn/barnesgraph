import React from 'react';
import './App.css';
import init, { create_graph } from 'layout';
import { graph } from './Data';

const XSHIFT = 1000;
const YSHIFT = 650;

function projectOntoBox(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  boxWidth: number,
  boxHeight: number,
): [number, number] {
  //return [toX, toY];
  const dx = toX - fromX;
  const dy = toY - fromY;
  // Figure out which of the four edges we're hitting by first rescaling.
  const rescaledDx = dx / boxWidth;
  const rescaledDy = dy / boxHeight;
  // Now we can figure out which edge we're hitting.
  const absRescaledDx = Math.abs(rescaledDx);
  const absRescaledDy = Math.abs(rescaledDy);
  if (absRescaledDx > absRescaledDy) {
    // We're hitting a vertical edge.
    if (rescaledDx > 0) {
      // We're hitting the right edge.
      return [toX - boxWidth / 2, toY - (boxWidth / 2) * (dy / dx)];
    } else {
      // We're hitting the left edge.
      return [toX + boxWidth / 2, toY + (boxWidth / 2) * (dy / dx)];
    }
  } else {
    // We're hitting a horizontal edge.
    if (rescaledDy > 0) {
      // We're hitting the bottom edge.
      return [toX - (boxHeight / 2) * (dx / dy), toY - boxHeight / 2];
    } else {
      // We're hitting the top edge.
      return [toX + (boxHeight / 2) * (dx / dy), toY + boxHeight / 2];
    }
  }
}

type GraphEdgeKind = 'stack' | 'arc' | 'jump';

interface GraphNode {
  contents: React.ReactNode;
}

interface GraphEdge {
  from: number;
  to: number;
  kind: GraphEdgeKind;
}

interface GraphProps {
  boxWidth: number;
  boxHeight: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

class Graph extends React.PureComponent<GraphProps, {
  stepCount: number;
}> {
  graphHandle: any;
  layoutArray: Float32Array | null = null;
  nodeFlagsArray: Uint8Array | null = null;
  stackIndexArray: Uint32Array | null = null;

  constructor(props: GraphProps) {
    super(props);
    this.state = {
      stepCount: 100,
    };
    this.updateGraphHandle(100);
  }

  updateGraphHandle(steps: number) {
    console.log('Updating graph:', steps);
    this.graphHandle = create_graph(
      this.props.boxWidth / this.props.boxHeight,
      this.props.edges,
    );
    this.layoutArray = new Float32Array(2 * this.props.nodes.length);
    this.nodeFlagsArray = new Uint8Array(this.props.nodes.length);
    this.stackIndexArray = new Uint32Array(this.props.nodes.length);
    const start = performance.now();
    this.graphHandle.solve(steps, 10.0, 10.0, this.layoutArray, this.nodeFlagsArray, this.stackIndexArray);
    const end = performance.now();
    console.log('Solved in', end - start, 'ms');
    //console.log('Got:', this.graphHandle);
    //console.log('Layout:', this.layoutArray);
  }

  componentDidUpdate(prevProps: GraphProps) {
    //if (prevProps !== this.props) {
    //this.updateGraphHandle();
    //}
  }

  render() {
    const renderedEdges: any = [];
    for (let i = 0; i < this.props.edges.length; i++) {
      const edge = this.props.edges[i];
      if (this.stackIndexArray![edge.from] === this.stackIndexArray![edge.to])
        continue;
      let fromX = XSHIFT + this.props.boxHeight * (this.layoutArray![2 * edge.from + 0]) + this.props.boxWidth / 2;
      let fromY = YSHIFT + this.props.boxHeight * (0.5 + this.layoutArray![2 * edge.from + 1]);
      let toX = XSHIFT + this.props.boxHeight * (this.layoutArray![2 * edge.to + 0]) + this.props.boxWidth / 2;
      let toY = YSHIFT + this.props.boxHeight * (0.5 + this.layoutArray![2 * edge.to + 1]);
      const startPoint = projectOntoBox(toX, toY, fromX, fromY, this.props.boxWidth, this.props.boxHeight);
      const endPoint = projectOntoBox(fromX, fromY, toX, toY, this.props.boxWidth, this.props.boxHeight);
      let path = `M ${startPoint[0]} ${startPoint[1]} L ${endPoint[0]} ${endPoint[1]}`;
      renderedEdges.push(<path key={2 * i + 0} d={path} stroke="red" strokeWidth="2" fill="none" />);
      // Add an arrow head to the end.
      const dx = endPoint[0] - startPoint[0];
      const dy = endPoint[1] - startPoint[1];
      const angle = Math.atan2(dy, dx);
      const arrowHeadLength = 10;
      const arrowHeadWidth = 7;
      const arrowHeadX = endPoint[0] - arrowHeadLength * Math.cos(angle);
      const arrowHeadY = endPoint[1] - arrowHeadLength * Math.sin(angle);
      const arrowHeadLeftX = arrowHeadX - arrowHeadWidth * Math.cos(angle + Math.PI / 2);
      const arrowHeadLeftY = arrowHeadY - arrowHeadWidth * Math.sin(angle + Math.PI / 2);
      const arrowHeadRightX = arrowHeadX + arrowHeadWidth * Math.cos(angle + Math.PI / 2);
      const arrowHeadRightY = arrowHeadY + arrowHeadWidth * Math.sin(angle + Math.PI / 2);
      path = `M ${endPoint[0]} ${endPoint[1]} L ${arrowHeadRightX} ${arrowHeadRightY} L ${arrowHeadLeftX} ${arrowHeadLeftY} Z`;
      renderedEdges.push(<path key={2 * i + 1} d={path} stroke="red" strokeWidth="2" fill="red" />);
    }

    return (
      <div>
        <div style={{
          position: 'relative',
          border: '1px solid black',
          width: 2500,
          height: 1500,
        }}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 2500 1500"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 2500,
              height: 1500,
              zIndex: 1,
            }}
          >
            {renderedEdges}
          </svg>
          {this.props.nodes.map((node, i) => {
            const x = this.layoutArray ? this.layoutArray[2 * i + 0] : 0;
            const y = this.layoutArray ? this.layoutArray[2 * i + 1] : 0;
            //console.log('Node', i, 'at', x, y);
            return <div
              key={i}
              style={{
                position: 'absolute',
                left: XSHIFT + this.props.boxHeight * x,
                top: YSHIFT + this.props.boxHeight * y,
                width: this.props.boxWidth,
                height: this.props.boxHeight,
                boxSizing: 'border-box',
                border: '1px solid black',
                padding: 10,
                backgroundColor: '#ccc',
              }}
            >
              {node.contents} {/*this.stackIndexArray ? this.stackIndexArray[i] : '?'*/}
            </div>;
          })}
          <div
            style={{
              position: 'absolute',
              left: XSHIFT - 5,
              top: YSHIFT - 5,
              width: 10,
              height: 10,
              zIndex: 100,
              opacity: 0,
              backgroundColor: 'red',
            }}
          />
        </div>

        <div>
          <button onClick={() => {
            this.setState({ stepCount: this.state.stepCount + 1 });
            this.updateGraphHandle(this.state.stepCount + 1);
          }}>Step</button>
          <button onClick={() => {
            this.setState({ stepCount: this.state.stepCount - 1 });
            this.updateGraphHandle(this.state.stepCount - 1);
          }}>Unstep</button>
        </div>
      </div>
    );
  }
}

function AppWithWasm() {
  const nodes = [];
  const edges: GraphEdge[] = [];
  for (let repetitions = 0; repetitions < 500; repetitions++) {
    const nodeMapping = new Map<number, number>();
    for (const v of Object.values(graph.nodes)) {
      nodeMapping.set(v.id, nodes.length);
      nodes.push({
        contents: <div>Node {nodes.length}</div>,
      });
    }
    for (const e of Object.values(graph.edges)) {
      edges.push({
        from: nodeMapping.get(e.source)!,
        to: nodeMapping.get(e.target)!,
        kind: 'stack',
      });
    }
  }

  return (
    <Graph
      boxWidth={140}
      boxHeight={100}
      nodes={nodes}
      edges={edges}
    />
  );
}

function App() {
  const [initialized, setInitialized] = React.useState(false);
  React.useEffect(() => {
    console.log('Initializing wasm...');
    init()
      .then(() => setInitialized(true))
      .catch(console.error);
  }, []);
  return initialized ? <AppWithWasm /> : <div>Loading...</div>;
}

export default App;

/*
      nodes={[
        { contents: '0' },
        { contents: '1' },
        { contents: '2' },
        { contents: '3' },
        { contents: '4' },
        { contents: '5' },
        { contents: '6' },
        { contents: '7' },
        { contents: '8' },
        { contents: '9' },
      ]}
      edges={[
        { from: 0, to: 1, kind: 'stack' },
        { from: 1, to: 2, kind: 'stack' },
        { from: 1, to: 3, kind: 'arc' },
        { from: 1, to: 4, kind: 'arc' },
        { from: 3, to: 5, kind: 'stack' },
        { from: 4, to: 6, kind: 'stack' },
        { from: 6, to: 7, kind: 'arc' },
        { from: 6, to: 8, kind: 'arc' },
        { from: 8, to: 9, kind: 'arc' },
        { from: 5, to: 7, kind: 'arc' },
        //{ from: 2, to: 5, kind: 'stack' },
        //{ from: 2, to: 6, kind: 'arc' },
        //{ from: 3, to: 7, kind: 'stack' },
        //{ from: 3, to: 8, kind: 'arc' },
        //{ from: 4, to: 9, kind: 'stack' },
      ]}
*/
