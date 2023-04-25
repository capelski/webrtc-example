import React, { useEffect, useState } from 'react';
import * as ReactDOMClient from 'react-dom/client';
import { RTCWrapper, RTCWrapperHandlers } from './rtc-wrapper';

// TODO Option to remove logic checks
// TODO Remove Offer/Answer radio buttons
// Differentiate native events vs pseudo events

enum ConnectionMode {
    offer = 'offer',
    answer = 'answer',
}

function App() {
    const [connectionMode, setConnectionMode] = useState<ConnectionMode>(ConnectionMode.offer);
    const [rtcWrapper, setRtcWrapper] = useState<{ ref: RTCWrapper }>({ ref: new RTCWrapper() });
    const [createSendChannel, setCreateSendChannel] = useState(true);
    const [connectionEvents, setConnectionEvents] = useState<string[]>([]);

    const [remoteSessionInit, setRemoteSessionInit] = useState('');
    const [remoteIceCandidates, setRemoteIceCandidates] = useState('');
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
                    rtcWrapper.ref.closeConnection();
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

        rtcWrapper.ref.setEventHandlers(handlers);
    }

    function initialize() {
        rtcWrapper.ref.initialize();
        setRtcWrapper({ ref: rtcWrapper.ref });
    }

    function connectionModeChange(event: React.ChangeEvent<HTMLInputElement>) {
        const nextConnectionMode = event.target.value as ConnectionMode;
        setConnectionMode(nextConnectionMode);
        if (nextConnectionMode === ConnectionMode.offer) {
            setCreateSendChannel(true);
        }
    }

    async function createOffer() {
        rtcWrapper.ref.createSendChannel('offerToAnswer');
        await rtcWrapper.ref.createOffer();
    }

    async function createAnswer() {
        if (createSendChannel) {
            rtcWrapper.ref.createSendChannel('answerToOffer');
        }
        await rtcWrapper.ref.createAnswer();
    }

    function setLocalDescription() {
        rtcWrapper.ref.setLocalDescription();
    }

    async function setRemoteData() {
        await rtcWrapper.ref.setRemoteData(
            JSON.parse(remoteSessionInit || '{}'),
            JSON.parse(remoteIceCandidates || '[]'),
        );
    }

    function clear() {
        rtcWrapper.ref.clear();

        setConnectionEvents([]);
        setMessage('');
        setRemoteIceCandidates('');
        setRemoteSessionInit('');
        setRtcWrapper({ ref: rtcWrapper.ref });
    }

    useEffect(() => {
        updateEventsAndRTCHandlers([]);
    }, [rtcWrapper]);

    const disableInitialize = !!rtcWrapper.ref.connection;
    const disableConnectionMode = !rtcWrapper.ref.isNewStatus;
    const disableGenerateOffer =
        connectionMode !== ConnectionMode.offer ||
        !rtcWrapper.ref.isNewStatus ||
        !!rtcWrapper.ref.sessionInit;
    const disableSetLocalDescription = !(
        (connectionMode === ConnectionMode.offer &&
            rtcWrapper.ref.isNewStatus &&
            !!rtcWrapper.ref.sessionInit) ||
        (connectionMode === ConnectionMode.answer &&
            rtcWrapper.ref.hasRemoteOffer &&
            !!rtcWrapper.ref.sessionInit)
    );
    const disableGenerateAnswer =
        connectionMode !== ConnectionMode.answer ||
        !rtcWrapper.ref.hasRemoteOffer ||
        !!rtcWrapper.ref.sessionInit;
    const disableCreateSendChannel =
        connectionMode === ConnectionMode.offer ||
        !rtcWrapper.ref.hasRemoteOffer ||
        !!rtcWrapper.ref.sessionInit;
    const disableSetRemoteData = !(
        (connectionMode === ConnectionMode.offer && rtcWrapper.ref.awaitingRemoteAnswer) ||
        (connectionMode === ConnectionMode.answer && rtcWrapper.ref.isNewStatus)
    );
    const disableCloseConnection = !rtcWrapper.ref.isConnectedStatus;
    const disableSend = !rtcWrapper.ref.isConnectedStatus || !rtcWrapper.ref.sendChannel;
    const disableCloseReceive = !rtcWrapper.ref.isConnectedStatus || !rtcWrapper.ref.receiveChannel;
    const disableClear = !rtcWrapper.ref.isClosedStatus;

    return (
        <div>
            <div>
                <h2>Setup</h2>
                <p>
                    Connection status: {rtcWrapper.ref.connection?.connectionState || '-'} /{' '}
                    {rtcWrapper.ref.connection?.signalingState || '-'}
                </p>

                <p>
                    <button onClick={initialize} disabled={disableInitialize}>
                        Initialize
                    </button>
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
                        value={
                            rtcWrapper.ref.sessionInit
                                ? JSON.stringify(rtcWrapper.ref.sessionInit)
                                : ''
                        }
                    ></textarea>
                    <span>Local ICE Candidate</span>
                    <br />
                    <textarea
                        rows={2}
                        style={{ width: '100%' }}
                        disabled
                        value={
                            rtcWrapper.ref.iceCandidates?.length > 0
                                ? JSON.stringify(rtcWrapper.ref.iceCandidates)
                                : ''
                        }
                    ></textarea>
                    <br />
                    <button onClick={createOffer} disabled={disableGenerateOffer}>
                        Create offer
                    </button>
                    &emsp;
                    <button onClick={setLocalDescription} disabled={disableSetLocalDescription}>
                        Set local description
                    </button>
                    &emsp;
                    <button onClick={createAnswer} disabled={disableGenerateAnswer}>
                        Create answer
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
                        value={remoteIceCandidates}
                        onChange={(event) => {
                            setRemoteIceCandidates(event.target.value);
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
                        rtcWrapper.ref.sendChannel!.send(message);
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
                        rtcWrapper.ref.sendChannel!.close();
                    }}
                    disabled={disableSend}
                >
                    Close sending channel
                </button>
                &emsp;
                <button
                    onClick={() => {
                        rtcWrapper.ref.receiveChannel!.close();
                    }}
                    disabled={disableCloseReceive}
                >
                    Close receiving channel
                </button>
                &emsp;
                <button
                    onClick={() => {
                        rtcWrapper.ref.closeConnection();
                        updateEventsAndRTCHandlers(connectionEvents, [
                            'Connection closed by local peer',
                        ]);
                    }}
                    disabled={disableCloseConnection}
                >
                    Close connection
                </button>
                &emsp;
                <button onClick={clear} disabled={disableClear}>
                    Clear
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
