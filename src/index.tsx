import React, { useEffect, useState } from 'react';
import * as ReactDOMClient from 'react-dom/client';
import { RTCWrapper, RTCWrapperHandlers } from './rtc-wrapper';

// TODO Option to remove logic checks
// TODO Split Set remote data
// TODO Display a message to explain what to do with local offer/ICE candidates
// TODO Message stating that no channel on creation will result in errors

type RTCEvent = {
    content: string;
    isPseudoEvent?: boolean;
    timestamp: Date;
};

function App() {
    const [connectionEvents, setConnectionEvents] = useState<RTCEvent[]>([]);
    const [createSendChannel, setCreateSendChannel] = useState(true);
    const [message, setMessage] = useState('');
    const [remoteSessionInit, setRemoteSessionInit] = useState('');
    const [remoteIceCandidates, setRemoteIceCandidates] = useState('');
    const [rtcWrapper, setRtcWrapper] = useState<{ ref: RTCWrapper }>({ ref: new RTCWrapper() });

    function updateEventsAndRTCHandlers(
        currentConnectionEvents: RTCEvent[],
        newConnectionEvents: RTCEvent[] = [],
    ) {
        const nextConnectionEvents = newConnectionEvents.concat(currentConnectionEvents);
        setConnectionEvents(nextConnectionEvents);

        const handlers: RTCWrapperHandlers = {
            onAnswerCreated: (event) => {
                updateEventsAndRTCHandlers(nextConnectionEvents, [
                    {
                        content: `Answer created: ${event.detail.sdp?.substring(0, 15)}...`,
                        isPseudoEvent: true,
                        timestamp: new Date(),
                    },
                ]);
            },
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
            onOfferCreated: (event) => {
                updateEventsAndRTCHandlers(nextConnectionEvents, [
                    {
                        content: `Offer created: ${event.detail.sdp?.substring(0, 15)}...`,
                        isPseudoEvent: true,
                        timestamp: new Date(),
                    },
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
    }

    function initialize() {
        rtcWrapper.ref.initialize();
        setRtcWrapper({ ref: rtcWrapper.ref });
    }

    async function createOffer() {
        if (createSendChannel) {
            rtcWrapper.ref.createSendChannel('offerToAnswer');
        }
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
    const disableCreateSendChannel =
        !!rtcWrapper.ref.sessionInit ||
        (!rtcWrapper.ref.isNewStatus && !rtcWrapper.ref.hasRemoteOffer);
    const disableGenerateOffer = !!rtcWrapper.ref.sessionInit || !rtcWrapper.ref.isNewStatus;
    const disableGenerateAnswer = !!rtcWrapper.ref.sessionInit || !rtcWrapper.ref.hasRemoteOffer;
    const disableSetLocalDescription =
        !rtcWrapper.ref.sessionInit ||
        (!rtcWrapper.ref.isNewStatus && !rtcWrapper.ref.hasRemoteOffer);
    const disableSetRemoteData = !(
        (!rtcWrapper.ref.sessionInit && rtcWrapper.ref.isNewStatus) ||
        (!!rtcWrapper.ref.sessionInit && rtcWrapper.ref.awaitingRemoteAnswer)
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
                    <input
                        type="checkbox"
                        checked={createSendChannel}
                        onChange={() => {
                            setCreateSendChannel(!createSendChannel);
                        }}
                        disabled={disableCreateSendChannel}
                    />
                    Create send channel&emsp;
                    <button onClick={createOffer} disabled={disableGenerateOffer}>
                        Create offer
                    </button>
                    &emsp;
                    <button onClick={createAnswer} disabled={disableGenerateAnswer}>
                        Create answer
                    </button>
                    &emsp;
                    <button onClick={setLocalDescription} disabled={disableSetLocalDescription}>
                        Set local description
                    </button>
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
