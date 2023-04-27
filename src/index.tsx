import React, { useState } from 'react';
import * as ReactDOMClient from 'react-dom/client';
import { RTCWrapper, RTCWrapperHandlers } from './rtc-wrapper';

// TODO Display a message to explain what to do with local offer/ICE candidates

type RTCEvent = {
    content: string;
    isPseudoEvent?: boolean;
    timestamp: Date;
};

function App() {
    const [connectionEvents, setConnectionEvents] = useState<RTCEvent[]>([]);
    const [createSendChannel, setCreateSendChannel] = useState(true);
    const [hasAddedRemoteCandidates, setHasAddedRemoteCandidates] = useState(false);
    const [message, setMessage] = useState('');
    const [remoteSessionInit, setRemoteSessionInit] = useState('');
    const [remoteIceCandidates, setRemoteIceCandidates] = useState('');
    const [rtcWrapper, setRtcWrapper] = useState<{ ref: RTCWrapper }>({ ref: new RTCWrapper() });

    function updateEventsAndRTCHandlers(
        currentConnectionEvents: RTCEvent[],
        newConnectionEvents: RTCEvent[] = [],
    ) {
        const nextConnectionEvents = newConnectionEvents.concat(currentConnectionEvents);

        const handlers: RTCWrapperHandlers = {
            onConnectionStateChange: (event) => {
                const newEvents: RTCEvent[] = [
                    { content: `Connection state change: ${event.detail}`, timestamp: new Date() },
                ];
                if (event.detail === 'disconnected') {
                    // Connection was closed by the remote peer; the app state must be updated on this peer
                    rtcWrapper.ref.closeConnection();
                    newEvents.unshift({
                        content: 'Connection closed by remote peer',
                        isPseudoEvent: true,
                        timestamp: new Date(),
                    });
                }
                updateEventsAndRTCHandlers(nextConnectionEvents, newEvents);
            },
            onIceCandidate: (event) => {
                updateEventsAndRTCHandlers(nextConnectionEvents, [
                    {
                        content: `ICE candidate generated: ${event.detail.address}`,
                        timestamp: new Date(),
                    },
                ]);
            },
            onMessageReceived: (event) => {
                updateEventsAndRTCHandlers(nextConnectionEvents, [
                    { content: `Message received: ${event.detail}`, timestamp: new Date() },
                ]);
            },
            onReceiveChannelClosed: () => {
                updateEventsAndRTCHandlers(nextConnectionEvents, [
                    { content: 'Receiving channel closed', timestamp: new Date() },
                ]);
            },
            onReceiveChannelOpened: (event) => {
                updateEventsAndRTCHandlers(nextConnectionEvents, [
                    {
                        content: `Receiving channel opened: ${event.detail.label}`,
                        timestamp: new Date(),
                    },
                ]);
            },
            onSendChannelClosed: () => {
                updateEventsAndRTCHandlers(nextConnectionEvents, [
                    { content: 'Sending channel closed', timestamp: new Date() },
                ]);
            },
            onSendChannelOpened: (event) => {
                updateEventsAndRTCHandlers(nextConnectionEvents, [
                    {
                        content: `Sending channel opened: ${event.detail.label}`,
                        timestamp: new Date(),
                    },
                ]);
            },
            onSignalingStateChange: (event) => {
                updateEventsAndRTCHandlers(nextConnectionEvents, [
                    { content: `Signaling state change: ${event.detail}`, timestamp: new Date() },
                ]);
            },
        };

        rtcWrapper.ref.setEventHandlers(handlers);

        setConnectionEvents(nextConnectionEvents);
        setRtcWrapper({ ref: rtcWrapper.ref });
    }

    function initialize() {
        rtcWrapper.ref.initialize();
        updateEventsAndRTCHandlers([]);
        setRtcWrapper({ ref: rtcWrapper.ref });
    }

    async function createOffer() {
        if (createSendChannel) {
            rtcWrapper.ref.createSendChannel('offerToAnswer');
        }
        await rtcWrapper.ref.createOffer();
        updateEventsAndRTCHandlers(connectionEvents, [
            {
                content: `Offer created: ${rtcWrapper.ref.sessionInit?.sdp?.substring(0, 15)}...`,
                isPseudoEvent: true,
                timestamp: new Date(),
            },
        ]);
    }

    async function createAnswer() {
        if (createSendChannel) {
            rtcWrapper.ref.createSendChannel('answerToOffer');
        }
        await rtcWrapper.ref.createAnswer();
        updateEventsAndRTCHandlers(connectionEvents, [
            {
                content: `Answer created: ${rtcWrapper.ref.sessionInit?.sdp?.substring(0, 15)}...`,
                isPseudoEvent: true,
                timestamp: new Date(),
            },
        ]);
    }

    async function setLocalDescription() {
        await rtcWrapper.ref.setLocalDescription();
    }

    async function setRemoteDescription() {
        await rtcWrapper.ref.setRemoteDescription(JSON.parse(remoteSessionInit || '{}'));
    }

    async function setRemoteIceCandidatesHandler() {
        await rtcWrapper.ref.setRemoteICECandidates(JSON.parse(remoteIceCandidates || '[]'));
        updateEventsAndRTCHandlers(connectionEvents, [
            {
                content: `Remote ICE Candidates added`,
                isPseudoEvent: true,
                timestamp: new Date(),
            },
        ]);
        setHasAddedRemoteCandidates(true);
    }

    function clear() {
        rtcWrapper.ref.clear();

        setConnectionEvents([]);
        setMessage('');
        setRemoteIceCandidates('');
        setRemoteSessionInit('');
        setRtcWrapper({ ref: rtcWrapper.ref });
    }

    const disableInitialize = !!rtcWrapper.ref.connection;
    const disableCreateOffer = !rtcWrapper.ref.isNewStatus;
    const disableCreateAnswer = !rtcWrapper.ref.hasRemoteOffer || !hasAddedRemoteCandidates;
    const disableCreateSendChannel =
        !!rtcWrapper.ref.sessionInit || (disableCreateOffer && disableCreateAnswer);
    const disableSetLocalDescription =
        !rtcWrapper.ref.sessionInit ||
        (!rtcWrapper.ref.isNewStatus && !rtcWrapper.ref.hasRemoteOffer);
    const disableSetRemoteDescription = !(
        (!rtcWrapper.ref.sessionInit && rtcWrapper.ref.isNewStatus) ||
        (!!rtcWrapper.ref.sessionInit && rtcWrapper.ref.awaitingRemoteAnswer)
    );
    const disableSetRemoteICECandidates =
        hasAddedRemoteCandidates || !!rtcWrapper.ref.sessionInit || !rtcWrapper.ref.hasRemoteOffer;
    const disableCloseConnection = !rtcWrapper.ref.isConnectedStatus;
    const disableSend = !rtcWrapper.ref.isConnectedStatus || !rtcWrapper.ref.sendChannel;
    const disableCloseReceive = !rtcWrapper.ref.isConnectedStatus || !rtcWrapper.ref.receiveChannel;
    const disableClear = !rtcWrapper.ref.isClosedStatus;

    const displayChannelWarning =
        !disableCreateSendChannel && rtcWrapper.ref.isNewStatus && !createSendChannel;
    const displaySignalingInstructions = rtcWrapper.ref.hasLocalOffer;

    return (
        <div>
            <div>
                <h2>Setup</h2>

                <p>
                    <button onClick={initialize} disabled={disableInitialize}>
                        Initialize
                    </button>
                </p>

                <p>
                    Connection status: {rtcWrapper.ref.connection?.connectionState || '-'} /{' '}
                    {rtcWrapper.ref.connection?.signalingState || '-'}
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
                    {displaySignalingInstructions && (
                        <React.Fragment>
                            <br />
                            <span style={{ color: 'lightblue' }}>
                                ℹ️ Copy the "Local session" data into the "Remote session" textarea
                                of the other tab
                            </span>
                            <br />
                            <br />
                        </React.Fragment>
                    )}
                    <span>Local ICE Candidates</span>
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
                    {displaySignalingInstructions && (
                        <React.Fragment>
                            <br />
                            <span style={{ color: 'lightblue' }}>
                                ℹ️ Copy the "Local ICE Candidates" data into the "Remote ICE
                                Candidates" textarea of the other tab
                            </span>
                            <br />
                            <br />
                        </React.Fragment>
                    )}
                    <br />
                    <input
                        type="checkbox"
                        checked={createSendChannel}
                        onChange={() => {
                            setCreateSendChannel(!createSendChannel);
                        }}
                        disabled={disableCreateSendChannel}
                    />
                    Create send channel&emsp;
                    <button onClick={createOffer} disabled={disableCreateOffer}>
                        Create offer
                    </button>
                    &emsp;
                    <button onClick={createAnswer} disabled={disableCreateAnswer}>
                        Create answer
                    </button>
                    &emsp;
                    <button onClick={setLocalDescription} disabled={disableSetLocalDescription}>
                        Set local description
                    </button>
                    <br />
                    {displayChannelWarning && (
                        <p style={{ color: 'red' }}>
                            ❗️ Creating an offer without having created a data channel first will
                            NOT generate ICE Candidates, thus preventing the connection.
                        </p>
                    )}
                    <br />
                    <span>Remote session</span>
                    <br />
                    <textarea
                        rows={5}
                        style={{ width: '100%' }}
                        disabled={disableSetRemoteDescription}
                        value={remoteSessionInit}
                        onChange={(event) => {
                            setRemoteSessionInit(event.target.value);
                        }}
                    ></textarea>
                    <br />
                    <button
                        onClick={setRemoteDescription}
                        disabled={!remoteSessionInit || disableSetRemoteDescription}
                    >
                        Set remote description
                    </button>
                    <br />
                    <br />
                    <span>Remote ICE Candidates</span>
                    <br />
                    <textarea
                        rows={2}
                        style={{ width: '100%' }}
                        disabled={disableSetRemoteICECandidates}
                        value={remoteIceCandidates}
                        onChange={(event) => {
                            setRemoteIceCandidates(event.target.value);
                        }}
                    ></textarea>
                    <br />
                    {
                        <button
                            onClick={setRemoteIceCandidatesHandler}
                            disabled={!remoteIceCandidates || disableSetRemoteICECandidates}
                        >
                            Set remote ICE candidates
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

                        updateEventsAndRTCHandlers(connectionEvents, [
                            {
                                content: `Message sent: ${message}`,
                                isPseudoEvent: true,
                                timestamp: new Date(),
                            },
                        ]);
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
                            {
                                content: 'Connection closed by local peer',
                                isPseudoEvent: true,
                                timestamp: new Date(),
                            },
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
                {connectionEvents.map((cEvent, index) => (
                    <p
                        key={`event-${index}`}
                        style={cEvent.isPseudoEvent ? { fontStyle: 'italic' } : undefined}
                    >
                        {cEvent.isPseudoEvent ? '*' : '-'}{' '}
                        {cEvent.timestamp.toISOString().substring(11, 23)} {cEvent.content}
                    </p>
                ))}
            </div>
        </div>
    );
}

const appPlaceholder = document.getElementById('app-placeholder')!;
const root = ReactDOMClient.createRoot(appPlaceholder);
root.render(<App />);
