import React from 'react';
import './App.css';
import { graph } from './Data';

const XSHIFT = 1000;
const YSHIFT = 650;


function AppWithWasm() {
  const nodes = [];
  const edges: GraphEdge[] = [];
  for (let repetitions = 0; repetitions < 2; repetitions++) {
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
