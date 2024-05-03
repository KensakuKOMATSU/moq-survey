import Sender from './components/sender';
import Receiver from './components/receiver';

import './App.css';

const DEFAULT_EP = "http://localhost:4433/moq"


function App() {
  const moqtEp = process.env.REACT_APP_MOQT_EP || DEFAULT_EP

  return (
    <div className="App">
      <main>
        <div className='component'>
          <Sender endpoint={moqtEp} />
        </div>
        <div className='component'>
          <Receiver endpoint={moqtEp} />
        </div>
      </main>
    </div>
  );
}

export default App;
