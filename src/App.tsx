import { useState } from 'react';

import Sender from './components/sender';
import Receiver from './components/receiver';

import VideoSender from './components/video-sender';
import VideoReceiver from './components/video-receiver';

import './App.css';

const DEFAULT_EP = "http://localhost:4433/moq"


function App() {
  const [ _trackName, setTrackName ] = useState<String>('')
  const moqtEp = process.env.REACT_APP_MOQT_EP || DEFAULT_EP

  return (
    <div className="App">
      <main>
        <h1>MOQT survey</h1>
        <div className='container'>
          <h2>video stream</h2>
          <div className='wrapper'>
            <div className='component'>
              <VideoSender endpoint={moqtEp} trackName={_trackName} setTrackName={setTrackName} />
            </div>
            <div className='component'>
              <VideoReceiver endpoint={moqtEp} trackName={_trackName} />
            </div>
          </div>
        </div>
        <div className='container'>
          <h2>text stream</h2>
          <div className='wrapper'>
            <div className='component'>
              <Sender endpoint={moqtEp} />
            </div>
            <div className='component'>
              <Receiver endpoint={moqtEp} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
