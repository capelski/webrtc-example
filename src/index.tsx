import React, { useState } from 'react';
import * as ReactDOMClient from 'react-dom/client';

// TODO channel.close();
// TODO connection.close();
// TODO Use rxjs to publish events for RTCConnection

type SetupParameters = {
    onConnectionEstablished: () => void;
    onIceCandidateGenerated: (candidate: RTCIceCandidate) => void;
    onIncomingMessage: (data: string) => void;
    outgoingChannelName: string;
};

function setupDuplexConnection(params: SetupParameters) {
    const connection = new RTCPeerConnection();

    connection.onicecandidate = (event) => {
        if (event.candidate) {
            params.onIceCandidateGenerated(event.candidate);
        }
    };

    connection.ondatachannel = (event) => {
        params.onConnectionEstablished();
        const receiveChannel = event.channel;
        receiveChannel.onmessage = (event) => {
            params.onIncomingMessage(event.data);
        };
        // receiveChannel.onopen = () => {
        //     console.log('Receiving channel opened');
        // };
        // receiveChannel.onclose = () => {
        //     console.log('Receiving channel closed');
        // };
    };

    const sendChannel = connection.createDataChannel(params.outgoingChannelName);
    // sendChannel.onopen = () => {
    //   console.log('Sending channel opened')
    // };
    // sendChannel.onclose = () => {
    //   console.log('Sending channel closed')
    // };

    return {
        connection,
        sendChannel,
    };
}

type ConnectionData = {
    candidate: RTCIceCandidate;
    sessionInit: RTCSessionDescriptionInit;
};

let connection: RTCPeerConnection;
let sendChannel: RTCDataChannel;

enum Phase {
    selectMode = 'select-mode',
    setupConnection = 'setup-connection',
    connectionEstablished = 'connection-established',
}

enum Mode {
    starter = 'starter',
    joiner = 'joiner',
}

function App() {
    const [mode, setMode] = useState<Mode>();
    const [phase, setPhase] = useState<Phase>(Phase.selectMode);

    const [candidate, setCandidate] = useState<RTCIceCandidate>();
    const [sessionInit, setSessionInit] = useState<RTCSessionDescriptionInit>();

    const [message, setMessage] = useState('');
    const [chat, setChat] = useState<string[]>([]);

    const connectionData: ConnectionData = {
        candidate: candidate!,
        sessionInit: sessionInit!,
    };

    async function start() {
        const setup = setupDuplexConnection({
            onConnectionEstablished: () => {
                setPhase(Phase.connectionEstablished);
            },
            onIceCandidateGenerated: (candidate) => {
                setCandidate(candidate);
            },
            onIncomingMessage: (data) => {
                setChat(chat.concat([`Them: ${data}`]));
            },
            outgoingChannelName: 'starterToJoiner',
        });

        ({ connection, sendChannel } = setup);

        const offer = await connection.createOffer(); // This operation will generate many ice candidates
        await connection.setLocalDescription(offer);

        setSessionInit(offer);
    }

    async function join() {
        const setup = setupDuplexConnection({
            onConnectionEstablished: () => {
                setPhase(Phase.connectionEstablished);
            },
            onIceCandidateGenerated: (candidate) => {
                setCandidate(candidate);
            },
            onIncomingMessage: (data) => {
                setChat(chat.concat([`Them: ${data}`]));
            },
            outgoingChannelName: 'joinerToStarter',
        });

        ({ connection, sendChannel } = setup);

        const connectionData: ConnectionData = JSON.parse(
            document.querySelector<HTMLTextAreaElement>('textarea#offer-in')!.value,
        );
        await connection.setRemoteDescription(connectionData.sessionInit);
        await connection.addIceCandidate(connectionData.candidate);

        const answer = await connection.createAnswer(); // This operation will generate many ice candidates
        await connection.setLocalDescription(answer);

        setSessionInit(answer);
    }

    async function accept() {
        const connectionData: ConnectionData = JSON.parse(
            document.querySelector<HTMLTextAreaElement>('textarea#answer-in')!.value,
        );
        await connection.setRemoteDescription(connectionData.sessionInit);
        await connection.addIceCandidate(connectionData.candidate);
    }

    async function send(payload: string) {
        await sendChannel.send(payload);
    }

    return (
        <div>
            {phase === Phase.selectMode && (
                <div>
                    <button
                        onClick={() => {
                            setMode(Mode.starter);
                            setPhase(Phase.setupConnection);
                            start();
                        }}
                    >
                        Start session
                    </button>
                    &emsp;
                    <button
                        onClick={() => {
                            setMode(Mode.joiner);
                            setPhase(Phase.setupConnection);
                        }}
                    >
                        Join session
                    </button>
                </div>
            )}

            {phase === Phase.setupConnection && mode === Mode.starter && (
                <div>
                    <h2>Caller</h2>
                    <button onClick={start}>Start</button>
                    <p>Outgoing connection</p>
                    <textarea
                        rows={5}
                        style={{ width: '100%' }}
                        id="offer-out"
                        disabled
                        value={JSON.stringify(connectionData)}
                    ></textarea>
                    <p>Incoming connection</p>
                    <textarea rows={5} style={{ width: '100%' }} id="answer-in"></textarea>
                    <br />
                    <button onClick={accept}>Accept</button>
                    <br />
                </div>
            )}

            {phase === Phase.setupConnection && mode === Mode.joiner && (
                <div>
                    <h2>Callee</h2>
                    <p>Incoming connection</p>
                    <textarea rows={5} style={{ width: '100%' }} id="offer-in"></textarea>
                    <br />
                    <button onClick={join}>Join</button>
                    <p>Outgoing connection</p>
                    <textarea
                        rows={5}
                        style={{ width: '100%' }}
                        id="answer-out"
                        disabled
                        value={JSON.stringify(connectionData)}
                    ></textarea>
                    <br />
                </div>
            )}

            {phase === Phase.connectionEstablished && (
                <div>
                    <h2>Chat</h2>
                    {chat.map((message) => (
                        <p>{message}</p>
                    ))}
                    <textarea
                        rows={5}
                        style={{ width: '100%' }}
                        value={message}
                        onChange={(event) => {
                            setMessage(event.target.value);
                        }}
                    ></textarea>
                    <button
                        onClick={() => {
                            setChat(chat.concat([`You: ${message}`]));
                            send(message);
                        }}
                    >
                        Send
                    </button>
                </div>
            )}
        </div>
    );
}

const appPlaceholder = document.getElementById('app-placeholder')!;
const root = ReactDOMClient.createRoot(appPlaceholder);
root.render(<App />);
