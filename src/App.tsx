import Sender from './components/sender';

import './App.css';

const DEFAULT_EP = "http://localhost:4433/moq"


function App() {
  const moqtEp = process.env.REACT_APP_MOQT_EP || DEFAULT_EP

  return (
    <div className="App">
      <Sender endpoint={moqtEp} />
    </div>
  );
}

export default App;
