import React, { RefObject, useRef, useState } from 'react';
import * as ReactDOMClient from 'react-dom/client';
import { videoSize } from './constants';
import { RTCWrapper, RTCWrapperHandlers } from './rtc-wrapper';

// TODO Add link to medium article

type RTCEvent = {
    content: string;
    isPseudoEvent?: boolean;
    timestamp: Date;
};

function App() {
    const [connectionEvents, setConnectionEvents] = useState<RTCEvent[]>([]);
    const [hasAddedRemoteCandidates, setHasAddedRemoteCandidates] = useState(false);
    const [localMediaStream, setLocalMediaStream] = useState<MediaStream>();
    const [localMediaStreamLoading, setLocalMediaStreamLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [remoteIceCandidates, setRemoteIceCandidates] = useState('');
    const [remoteMediaStream, setRemoteMediaStream] = useState<MediaStream>();
    const [remoteSessionInit, setRemoteSessionInit] = useState('');
    const [rtcWrapper, setRtcWrapper] = useState<{ ref: RTCWrapper }>({ ref: new RTCWrapper() });

    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);

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
                    closeConnection();
                    newEvents.unshift({
                        content: 'Connection closed by remote peer',
                        isPseudoEvent: true,
                        timestamp: new Date(),
                    });
                }
                updateEventsAndRTCHandlers(nextConnectionEvents, newEvents);
            },
            onDataChannelClosed: (event) => {
                updateEventsAndRTCHandlers(nextConnectionEvents, [
                    {
                        content: `Data channel closed: ${event.detail.label}`,
                        timestamp: new Date(),
                    },
                ]);
            },
            onDataChannelOpened: (event) => {
                updateEventsAndRTCHandlers(nextConnectionEvents, [
                    {
                        content: `Data channel opened: ${event.detail.label}`,
                        timestamp: new Date(),
                    },
                ]);
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
            onSignalingStateChange: (event) => {
                updateEventsAndRTCHandlers(nextConnectionEvents, [
                    { content: `Signaling state change: ${event.detail}`, timestamp: new Date() },
                ]);
            },
            onTrackAdded: (event) => {
                let nextRemoteMediaStream = remoteMediaStream;

                if (!nextRemoteMediaStream) {
                    nextRemoteMediaStream = new MediaStream([event.detail]);
                    setRemoteMediaStream(nextRemoteMediaStream);
                    playMediaStream(remoteVideoRef, nextRemoteMediaStream);
                } else {
                    nextRemoteMediaStream.addTrack(event.detail);
                }

                updateEventsAndRTCHandlers(nextConnectionEvents, [
                    { content: `Stream track opened`, timestamp: new Date() },
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

    function createDataChannel() {
        rtcWrapper.ref.createDataChannel('the-one-and-only');
        setRtcWrapper({ ref: rtcWrapper.ref });
    }

    async function createStreamTrack() {
        setLocalMediaStreamLoading(true);

        const mediaStream = await navigator.mediaDevices.getUserMedia({
            // audio: true, // Disabled to prevent microphone feedback on same machine connections
            video: videoSize,
        });
        playMediaStream(localVideoRef, mediaStream);

        await rtcWrapper.ref.addUserMediaTracks(mediaStream.getTracks());

        setLocalMediaStream(mediaStream);
        setLocalMediaStreamLoading(false);
        setRtcWrapper({ ref: rtcWrapper.ref });
    }

    function playMediaStream(elementRef: RefObject<HTMLVideoElement>, mediaStream: MediaStream) {
        if (elementRef.current) {
            elementRef.current.srcObject = mediaStream;
            elementRef.current.play();
        }
    }

    async function createOffer() {
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

    function closeDataChannel() {
        rtcWrapper.ref.closeDataChannel();
    }

    function stopMediaStream(
        elementRef: RefObject<HTMLVideoElement>,
        mediaStream: MediaStream | undefined,
        mediaStreamSetter: (mediaStream: MediaStream | undefined) => void,
    ) {
        if (mediaStream) {
            mediaStream.getTracks().forEach((track) => {
                track.stop();
            });

            if (elementRef.current) {
                elementRef.current.srcObject = null;
            }

            mediaStreamSetter(undefined);
        }
    }

    function stopLocalMediaStream() {
        stopMediaStream(localVideoRef, localMediaStream, setLocalMediaStream);
    }

    function stopRemoteMediaStream() {
        stopMediaStream(remoteVideoRef, remoteMediaStream, setRemoteMediaStream);
    }

    function closeConnection() {
        stopLocalMediaStream();
        stopRemoteMediaStream();

        rtcWrapper.ref.closeConnection();

        updateEventsAndRTCHandlers(connectionEvents, [
            {
                content: 'Connection closed by local peer',
                isPseudoEvent: true,
                timestamp: new Date(),
            },
        ]);
    }

    function clear() {
        rtcWrapper.ref.clear();

        setConnectionEvents([]);
        setHasAddedRemoteCandidates(false);
        setMessage('');
        setRemoteIceCandidates('');
        setRemoteSessionInit('');
        setRtcWrapper({ ref: rtcWrapper.ref });
    }

    const disableInitialize = !!rtcWrapper.ref.connection;
    const disableCreateDataChannel = !rtcWrapper.ref.isNewStatus || !!rtcWrapper.ref.dataChannel;
    const disableCreateStream =
        localMediaStreamLoading ||
        !!localMediaStream ||
        !(
            rtcWrapper.ref.isNewStatus ||
            (rtcWrapper.ref.hasRemoteOffer && hasAddedRemoteCandidates)
        );
    const disableCreateOffer =
        !rtcWrapper.ref.isNewStatus || (!rtcWrapper.ref.dataChannel && !localMediaStream);
    const disableCreateAnswer = !rtcWrapper.ref.hasRemoteOffer || !hasAddedRemoteCandidates;
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
    const disableSendData = !rtcWrapper.ref.isConnectedStatus || !rtcWrapper.ref.dataChannel;
    const disableClear = !rtcWrapper.ref.isClosedStatus;

    const displaySessionInstructions =
        rtcWrapper.ref.hasLocalOffer || rtcWrapper.ref.awaitingAnswerAcceptance;
    const displayICECandidatesInstructions = rtcWrapper.ref.hasLocalOffer;

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
                <button onClick={createDataChannel} disabled={disableCreateDataChannel}>
                    Create data channel
                </button>
                &emsp;
                <button onClick={createStreamTrack} disabled={disableCreateStream}>
                    Create media stream
                </button>
                {localMediaStreamLoading && ' ⌛️'}
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
                    {displaySessionInstructions && (
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
                    {displayICECandidatesInstructions && (
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
                <h2>Media</h2>
                <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap' }}>
                    <div style={{ marginBottom: 8 }}>
                        <video
                            ref={localVideoRef}
                            style={{
                                backgroundColor: 'lightgrey',
                                marginBottom: 8,
                                maxHeight: '53.44vw',
                                maxWidth: '95vw',
                                ...videoSize,
                            }}
                        />
                        <br />
                        <button onClick={stopLocalMediaStream} disabled={!localMediaStream}>
                            Stop local media stream
                        </button>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                        <video
                            ref={remoteVideoRef}
                            style={{
                                backgroundColor: 'lightgrey',
                                maxHeight: '53.44vw',
                                maxWidth: '95vw',
                                ...videoSize,
                            }}
                        />
                        <br />
                        <button onClick={stopRemoteMediaStream} disabled={!remoteMediaStream}>
                            Stop remote media stream
                        </button>
                    </div>
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
                    disabled={disableSendData}
                ></textarea>
                <button
                    onClick={() => {
                        rtcWrapper.ref.dataChannel!.send(message);
                        setMessage('');

                        updateEventsAndRTCHandlers(connectionEvents, [
                            {
                                content: `Message sent: ${message}`,
                                isPseudoEvent: true,
                                timestamp: new Date(),
                            },
                        ]);
                    }}
                    disabled={disableSendData}
                >
                    Send
                </button>
                &emsp;
                <button onClick={closeDataChannel} disabled={disableSendData}>
                    Close data channel
                </button>
            </div>

            <div>
                <h2>Tear down</h2>
                <button onClick={closeConnection} disabled={disableCloseConnection}>
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
