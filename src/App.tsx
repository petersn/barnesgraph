import React from 'react';
import './App.css';
import init, { create_graph } from 'layout';

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
      stepCount: 200,
    };
    this.updateGraphHandle(200);
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
    this.graphHandle.solve(steps, 10.0, 10.0, this.layoutArray, this.nodeFlagsArray, this.stackIndexArray);
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
      
    }

    return (
      <div>
        <div style={{
          position: 'relative',
          border: '1px solid black',
          width: 1000,
          height: 1000,
        }}>
          <svg width={1000} height={1000}>
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
                left: 500 + this.props.boxHeight * x,
                top: 500 + this.props.boxHeight * y,
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
              left: 500 - 5,
              top: 500 - 5,
              width: 10,
              height: 10,
              zIndex: 100,
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
  return (
    <Graph
      boxWidth={140}
      boxHeight={100}
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
        //{ from: 2, to: 5, kind: 'stack' },
        //{ from: 2, to: 6, kind: 'arc' },
        //{ from: 3, to: 7, kind: 'stack' },
        //{ from: 3, to: 8, kind: 'arc' },
        //{ from: 4, to: 9, kind: 'stack' },
      ]}
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
