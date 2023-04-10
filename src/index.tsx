import React, { useEffect, useState } from 'react';
import * as ReactDOMClient from 'react-dom/client';
import { RTCWrapper, RTCWrapperHandlers } from './rtc-wrapper';

enum ConnectionMode {
    offer = 'offer',
    answer = 'answer',
}

function App() {
    const [connectionMode, setConnectionMode] = useState<ConnectionMode>(ConnectionMode.offer);
    const [rtcWrapper, setRtcWrapper] = useState<RTCWrapper>(new RTCWrapper());
    const [createSendChannel, setCreateSendChannel] = useState(true);
    const [connectionEvents, setConnectionEvents] = useState<string[]>([]);

    const [remoteSessionInit, setRemoteSessionInit] = useState('');
    const [remoteIceCandidate, setRemoteIceCandidate] = useState('');
    const [message, setMessage] = useState('');

    function updateEventsAndRTCHandlers(
        currentConnectionEvents: string[],
        newConnectionEvents: string[] = [],
    ) {
        const nextConnectionEvents = newConnectionEvents
            .map((event) => `${new Date().toISOString().substring(11, 23)} ${event}`)
            .concat(currentConnectionEvents);
        setConnectionEvents(nextConnectionEvents);

        const handlers: RTCWrapperHandlers = {
            onAnswerCreated: (event) => {
                updateEventsAndRTCHandlers(nextConnectionEvents, [
                    `Answer created: ${event.detail.sdp?.substring(0, 15)}...`,
                ]);
            },
            onConnectionStateChange: (event) => {
                const newEvents = [`Connection state change: ${event.detail}`];
                if (event.detail === 'disconnected') {
                    // Connection was closed by the remote peer; the app state must be updated on this peer
                    rtcWrapper.closeConnection();
                    newEvents.push('Connection closed by remote peer');
                }
                updateEventsAndRTCHandlers(nextConnectionEvents, newEvents);
            },
            onIceCandidate: (event) => {
                updateEventsAndRTCHandlers(nextConnectionEvents, [
                    `ICE candidate generated: ${event.detail.address}`,
                ]);
            },
            onMessageReceived: (event) => {
                updateEventsAndRTCHandlers(nextConnectionEvents, [
                    `Message received: ${event.detail}`,
                ]);
            },
            onOfferCreated: (event) => {
                updateEventsAndRTCHandlers(nextConnectionEvents, [
                    `Offer created: ${event.detail.sdp?.substring(0, 15)}...`,
                ]);
            },
            onReceiveChannelClosed: () => {
                updateEventsAndRTCHandlers(nextConnectionEvents, ['Receiving channel closed']);
            },
            onReceiveChannelOpened: (event) => {
                updateEventsAndRTCHandlers(nextConnectionEvents, [
                    `Receiving channel opened: ${event.detail.label}`,
                ]);
            },
            onSendChannelClosed: () => {
                updateEventsAndRTCHandlers(nextConnectionEvents, ['Sending channel closed']);
            },
            onSendChannelOpened: (event) => {
                updateEventsAndRTCHandlers(nextConnectionEvents, [
                    `Sending channel opened: ${event.detail.label}`,
                ]);
            },
            onSignalingStateChange: (event) => {
                updateEventsAndRTCHandlers(nextConnectionEvents, [
                    `Signaling state change: ${event.detail}`,
                ]);
            },
        };

        rtcWrapper.setEventHandlers(handlers);
    }

    function connectionModeChange(event: React.ChangeEvent<HTMLInputElement>) {
        const nextConnectionMode = event.target.value as ConnectionMode;
        setConnectionMode(nextConnectionMode);
        if (nextConnectionMode === ConnectionMode.offer) {
            setCreateSendChannel(true);
        }
    }

    function reset() {
        setConnectionEvents([]);
        setMessage('');
        setRemoteIceCandidate('');
        setRemoteSessionInit('');
        setRtcWrapper(new RTCWrapper());
    }

    async function generateOffer() {
        rtcWrapper.createSendChannel('offerToAnswer');
        await rtcWrapper.setOffer();
    }

    async function generateAnswer() {
        if (createSendChannel) {
            rtcWrapper.createSendChannel('answerToOffer');
        }
        await rtcWrapper.setAnswer();
    }

    async function setRemoteData() {
        await rtcWrapper.setRemoteData(
            JSON.parse(remoteSessionInit || '{}'),
            JSON.parse(remoteIceCandidate || '{}'),
        );
    }

    useEffect(() => {
        updateEventsAndRTCHandlers([]);
    }, [rtcWrapper]);

    const disableConnectionMode = !rtcWrapper.isNewStatus;
    const disableGenerateOffer = connectionMode !== ConnectionMode.offer || !rtcWrapper.isNewStatus;
    const disableGenerateAnswer =
        connectionMode !== ConnectionMode.answer || !rtcWrapper.hasRemoteOffer;
    const disableCreateSendChannel =
        connectionMode === ConnectionMode.offer || !rtcWrapper.hasRemoteOffer;
    const disableSetRemoteData = !(
        (connectionMode === ConnectionMode.offer && rtcWrapper.awaitingRemoteAnswer) ||
        (connectionMode === ConnectionMode.answer && rtcWrapper.isNewStatus)
    );
    const disableCloseConnection = !rtcWrapper.isConnectedStatus;
    const disableSend = !rtcWrapper.isConnectedStatus || !rtcWrapper.sendChannel;
    const disableCloseReceive = !rtcWrapper.isConnectedStatus || !rtcWrapper.receiveChannel;
    const disableReset = !rtcWrapper.isClosedStatus;

    return (
        <div>
            <div>
                <h2>Setup</h2>
                <p>
                    Connection status: {rtcWrapper.connection.connectionState} /{' '}
                    {rtcWrapper.connection.signalingState}
                </p>

                <p>
                    Peer:{' '}
                    <input
                        type="radio"
                        name="connection-mode"
                        value={ConnectionMode.offer}
                        checked={connectionMode === ConnectionMode.offer}
                        onChange={connectionModeChange}
                        disabled={disableConnectionMode}
                    />
                    Offer
                    <input
                        type="radio"
                        name="connection-mode"
                        value={ConnectionMode.answer}
                        checked={connectionMode === ConnectionMode.answer}
                        onChange={connectionModeChange}
                        disabled={disableConnectionMode}
                    />
                    Answer
                </p>

                <div>
                    <span>Local session</span>
                    <br />
                    <textarea
                        rows={5}
                        style={{ width: '100%' }}
                        disabled
                        value={rtcWrapper.sessionInit ? JSON.stringify(rtcWrapper.sessionInit) : ''}
                    ></textarea>
                    <span>Local ICE Candidate</span>
                    <br />
                    <textarea
                        rows={2}
                        style={{ width: '100%' }}
                        disabled
                        value={
                            rtcWrapper.iceCandidate ? JSON.stringify(rtcWrapper.iceCandidate) : ''
                        }
                    ></textarea>
                    <br />
                    <button onClick={generateOffer} disabled={disableGenerateOffer}>
                        Generate offer
                    </button>
                    &emsp;
                    <button onClick={generateAnswer} disabled={disableGenerateAnswer}>
                        Generate answer
                    </button>
                    &emsp;
                    <input
                        type="checkbox"
                        checked={createSendChannel}
                        onChange={() => {
                            setCreateSendChannel(!createSendChannel);
                        }}
                        disabled={disableCreateSendChannel}
                    />
                    Create send channel
                    <br />
                    <br />
                    <span>Remote session</span>
                    <br />
                    <textarea
                        rows={5}
                        style={{ width: '100%' }}
                        disabled={disableSetRemoteData}
                        value={remoteSessionInit}
                        onChange={(event) => {
                            setRemoteSessionInit(event.target.value);
                        }}
                    ></textarea>
                    <span>Remote ICE Candidate</span>
                    <br />
                    <textarea
                        rows={2}
                        style={{ width: '100%' }}
                        disabled={disableSetRemoteData}
                        value={remoteIceCandidate}
                        onChange={(event) => {
                            setRemoteIceCandidate(event.target.value);
                        }}
                    ></textarea>
                    <br />
                    {
                        <button onClick={setRemoteData} disabled={disableSetRemoteData}>
                            Set remote data
                        </button>
                    }
                </div>
            </div>

            <div>
                <h2>Messages</h2>
                <textarea
                    rows={5}
                    style={{ width: '100%' }}
                    value={message}
                    onChange={(event) => {
                        setMessage(event.target.value);
                    }}
                    disabled={disableSend}
                ></textarea>
                <button
                    onClick={() => {
                        rtcWrapper.sendChannel!.send(message);
                        setMessage('');

                        updateEventsAndRTCHandlers(connectionEvents, [`Message sent: ${message}`]);
                    }}
                    disabled={disableSend}
                >
                    Send
                </button>
                &emsp;
                <button
                    onClick={() => {
                        rtcWrapper.sendChannel!.close();
                    }}
                    disabled={disableSend}
                >
                    Close sending channel
                </button>
                &emsp;
                <button
                    onClick={() => {
                        rtcWrapper.receiveChannel!.close();
                    }}
                    disabled={disableCloseReceive}
                >
                    Close receiving channel
                </button>
                &emsp;
                <button
                    onClick={() => {
                        rtcWrapper.closeConnection();
                        updateEventsAndRTCHandlers(connectionEvents, [
                            'Connection closed by local peer',
                        ]);
                    }}
                    disabled={disableCloseConnection}
                >
                    Close connection
                </button>
                &emsp;
                <button onClick={reset} disabled={disableReset}>
                    Reset
                </button>
            </div>

            <div>
                <h2>Events</h2>
                {connectionEvents.map((message, index) => (
                    <p key={`event-${index}`}>- {message}</p>
                ))}
            </div>
        </div>
    );
}

const appPlaceholder = document.getElementById('app-placeholder')!;
const root = ReactDOMClient.createRoot(appPlaceholder);
root.render(<App />);
