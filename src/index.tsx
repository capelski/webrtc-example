import React, { useState } from 'react';
import * as ReactDOMClient from 'react-dom/client';

// TODO channel.close();
// TODO connection.close();

type SetupParameters = {
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

function App() {
    const [candidate, setCandidate] = useState<RTCIceCandidate | undefined>(undefined);
    const [mode, setMode] = useState<string>('');
    const [sessionInit, setSessionInit] = useState<RTCSessionDescriptionInit | undefined>(
        undefined,
    );

    const connectionData: ConnectionData = {
        candidate: candidate!,
        sessionInit: sessionInit!,
    };

    async function start() {
        const setup = setupDuplexConnection({
            onIceCandidateGenerated: (candidate) => {
                setCandidate(candidate);
            },
            onIncomingMessage: (data) => {
                document.querySelector<HTMLTextAreaElement>('textarea#send-in')!.value = data;
            },
            outgoingChannelName: 'callerToCallee',
        });

        ({ connection, sendChannel } = setup);

        const offer = await connection.createOffer(); // This operation will generate many ice candidates
        await connection.setLocalDescription(offer);

        setSessionInit(offer);
    }

    async function join() {
        const setup = setupDuplexConnection({
            onIceCandidateGenerated: (candidate) => {
                setCandidate(candidate);
            },
            onIncomingMessage: (data) => {
                document.querySelector<HTMLTextAreaElement>('textarea#send-in')!.value = data;
            },
            outgoingChannelName: 'calleeToCaller',
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
            <p>
                Mode:
                <select onChange={(event) => setMode(event.target.value)} value={mode}>
                    <option value="">-</option>
                    <option value="caller">Caller</option>
                    <option value="callee">Callee</option>
                </select>
            </p>

            {mode === 'caller' && (
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
                    <hr />
                    <p>Incoming connection</p>
                    <textarea rows={5} style={{ width: '100%' }} id="answer-in"></textarea>
                    <br />
                    <button onClick={accept}>Accept</button>
                    <br />
                </div>
            )}

            {mode === 'callee' && (
                <div>
                    <h2>Callee</h2>
                    <p>Incoming connection</p>
                    <textarea rows={5} style={{ width: '100%' }} id="offer-in"></textarea>
                    <br />
                    <button onClick={join}>Join</button>
                    <hr />
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

            {
                <div>
                    <h2>Chat</h2>
                    <textarea rows={5} style={{ width: '100%' }} id="send-in" disabled></textarea>
                    <textarea rows={5} style={{ width: '100%' }} id="send-out"></textarea>
                    <button
                        onClick={() =>
                            send(
                                document.querySelector<HTMLTextAreaElement>('textarea#send-out')!
                                    .value,
                            )
                        }
                    >
                        Send
                    </button>
                </div>
            }
        </div>
    );
}

const appPlaceholder = document.getElementById('app-placeholder')!;
const root = ReactDOMClient.createRoot(appPlaceholder);
root.render(<App />);
