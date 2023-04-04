import React, { useEffect, useMemo, useState } from 'react';
import * as ReactDOMClient from 'react-dom/client';
import { Subject, Subscription } from 'rxjs';
import { PeerConnection, PeerConnectionData } from './peer-connection';

// TODO channel.close();
// TODO connection.close();

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
    const [peerConnection, setPeerConnection] = useState<PeerConnection>();

    const [message, setMessage] = useState('');
    const [conversation, setConversation] = useState<string[]>([]);

    const [, updateState] = useState({}); // Hack to trigger re-renders from RxJS subjects

    const eventHandlers = useMemo(() => {
        const handlers = {
            onIceCandidate: new Subject<PeerConnectionData>(),
            onDataChannelReady: new Subject<RTCDataChannel>(),
            onMessageReceived: new Subject<string>(),
        };

        handlers.onIceCandidate.subscribe(() => updateState({}));
        handlers.onDataChannelReady.subscribe(() => {
            setPhase(Phase.connectionEstablished);
        });
        handlers.onMessageReceived.subscribe((data) =>
            setConversation(conversation.concat([`Them: ${data}`])),
        );

        return handlers;
    }, []);

    const [messageReceivedSubscription, setMessageReceivedSubscription] = useState<Subscription>();
    useEffect(() => {
        if (messageReceivedSubscription) {
            messageReceivedSubscription.unsubscribe();
        }
        if (peerConnection) {
            const nextSubscription = peerConnection.onMessageReceived.subscribe((data) =>
                setConversation(conversation.concat([`Them: ${data}`])),
            );
            setMessageReceivedSubscription(nextSubscription);
        }
    }, [conversation]);

    async function start() {
        const nextPeerConnection = new PeerConnection('starterToJoiner', eventHandlers);

        setPeerConnection(nextPeerConnection);

        await nextPeerConnection.generateOffer();
    }

    async function join() {
        const nextPeerConnection = new PeerConnection('joinerToStarter', eventHandlers);

        setPeerConnection(nextPeerConnection);

        const connectionData: PeerConnectionData = JSON.parse(
            document.querySelector<HTMLTextAreaElement>('textarea#offer-in')!.value,
        );
        await nextPeerConnection.setPeerData(connectionData);

        await nextPeerConnection.generateAnswer();
    }

    async function accept() {
        const connectionData: PeerConnectionData = JSON.parse(
            document.querySelector<HTMLTextAreaElement>('textarea#answer-in')!.value,
        );
        await peerConnection?.setPeerData(connectionData);
    }

    async function send(payload: string) {
        await peerConnection?.send(payload);
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
                        value={
                            (peerConnection && JSON.stringify(peerConnection.connectionData)) || ''
                        }
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
                        value={
                            (peerConnection && JSON.stringify(peerConnection.connectionData)) || ''
                        }
                    ></textarea>
                    <br />
                </div>
            )}

            {phase === Phase.connectionEstablished && (
                <div>
                    <h2>Chat</h2>
                    {conversation.map((message, index) => (
                        <p key={`message-${index}`}>{message}</p>
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
                            setConversation(conversation.concat([`You: ${message}`]));
                            setMessage('');
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
