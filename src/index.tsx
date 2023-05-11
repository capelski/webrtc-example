import React, { RefObject, useMemo, useRef, useState } from 'react';
import * as ReactDOMClient from 'react-dom/client';
import { videoSize } from './constants';
import {
    RTCEvent,
    RTCRelatedState,
    RTCRelatedStateUpdate,
    getInitialRtcRelatedState,
    getNextRTCRelatedState,
} from './rtc-related-state';
import { RTCWrapper, RTCWrapperHandlers } from './rtc-wrapper';

// TODO Add link to medium article

function App() {
    const rtcWrapper = useMemo(() => new RTCWrapper(), []);

    const [hasAddedRemoteCandidates, setHasAddedRemoteCandidates] = useState(false);
    const [localMediaStreamLoading, setLocalMediaStreamLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [remoteIceCandidates, setRemoteIceCandidates] = useState('');
    const [remoteSessionInit, setRemoteSessionInit] = useState('');
    const [rtcRelatedState, setRtcRelatedState] = useState<RTCRelatedState>(
        getInitialRtcRelatedState(),
    );

    const [, forceUpdate] = useState({});

    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);

    function updateRtcEvents(currentRtcRelatedState: RTCRelatedState, newEvents: RTCEvent[]) {
        updateRtcRelatedState(currentRtcRelatedState, { newEvents });
    }

    function updateRtcRelatedState(
        currentRtcRelatedState: RTCRelatedState,
        stateUpdates: RTCRelatedStateUpdate,
    ) {
        const nextRtcRelatedState = getNextRTCRelatedState(currentRtcRelatedState, stateUpdates);
        setRtcRelatedState(nextRtcRelatedState);
        updateRtcHandlers(nextRtcRelatedState);
    }

    function updateRtcHandlers(currentRtcRelatedState: RTCRelatedState) {
        const handlers: RTCWrapperHandlers = {
            onConnectionStateChange: (event) => {
                const newEvents: RTCEvent[] = [
                    { content: `Connection state change: ${event.detail}`, timestamp: new Date() },
                ];

                if (event.detail === 'disconnected') {
                    // Connection was closed by the remote peer; the app state must be updated on this peer
                    const nextRtcRelatedState = getNextRTCRelatedState(currentRtcRelatedState, {
                        newEvents,
                    });
                    closeConnection(nextRtcRelatedState, 'remote');
                } else {
                    updateRtcEvents(currentRtcRelatedState, newEvents);
                }
            },
            onDataChannelClosed: (event) => {
                updateRtcEvents(currentRtcRelatedState, [
                    {
                        content: `Data channel closed: ${event.detail.label}`,
                        timestamp: new Date(),
                    },
                ]);
            },
            onDataChannelOpened: (event) => {
                updateRtcEvents(currentRtcRelatedState, [
                    {
                        content: `Data channel opened: ${event.detail.label}`,
                        timestamp: new Date(),
                    },
                ]);
            },
            onLocalIceCandidate: (event) => {
                updateRtcEvents(currentRtcRelatedState, [
                    {
                        content: `ICE candidate generated: ${event.detail.address}`,
                        timestamp: new Date(),
                    },
                ]);
            },
            onMessageReceived: (event) => {
                updateRtcEvents(currentRtcRelatedState, [
                    { content: `Message received: ${event.detail}`, timestamp: new Date() },
                ]);
            },
            onRemoteTrackAdded: (event) => {
                let nextRemoteMediaStream: MediaStream;

                if (!currentRtcRelatedState.remoteMediaStream) {
                    nextRemoteMediaStream = new MediaStream([event.detail]);
                    playMediaStream(remoteVideoRef, nextRemoteMediaStream);
                } else {
                    nextRemoteMediaStream = currentRtcRelatedState.remoteMediaStream;
                    nextRemoteMediaStream.addTrack(event.detail);
                }

                updateRtcRelatedState(currentRtcRelatedState, {
                    newEvents: [
                        {
                            content: `Remote ${event.detail.kind} stream track added`,
                            timestamp: new Date(),
                        },
                    ],
                    remoteMediaStream: nextRemoteMediaStream,
                });
            },
            onSignalingStateChange: (event) => {
                updateRtcEvents(currentRtcRelatedState, [
                    {
                        content: `Signaling state change: ${event.detail}`,
                        timestamp: new Date(),
                    },
                ]);
            },
        };

        rtcWrapper.setEventHandlers(handlers);
    }

    function initialize() {
        rtcWrapper.initialize();

        updateRtcEvents(rtcRelatedState, [
            {
                content: 'RTCPeerConnection object initialized',
                isPseudoEvent: true,
                timestamp: new Date(),
            },
        ]);
    }

    function createDataChannel() {
        rtcWrapper.createDataChannel('the-one-and-only');
        forceUpdate({});
    }

    async function createStreamTrack() {
        setLocalMediaStreamLoading(true);

        const localMediaStream = await navigator.mediaDevices.getUserMedia({
            // audio: true, // Disabled to prevent microphone feedback on same machine connections
            video: videoSize,
        });
        playMediaStream(localVideoRef, localMediaStream);

        const tracks = localMediaStream.getTracks();
        await rtcWrapper.addUserMediaTracks(tracks);

        setLocalMediaStreamLoading(false);
        updateRtcRelatedState(rtcRelatedState, {
            localMediaStream,
            newEvents: tracks.map<RTCEvent>((track) => ({
                content: `Local ${track.kind} stream track added`,
                isPseudoEvent: true,
                timestamp: new Date(),
            })),
        });
    }

    async function playMediaStream(
        elementRef: RefObject<HTMLVideoElement>,
        mediaStream: MediaStream,
    ) {
        if (elementRef.current) {
            elementRef.current.srcObject = mediaStream;

            try {
                await elementRef.current.play();
            } catch (error) {
                // The following error is raised when a new track is added to a playing media
                const isBenignError = error.message.includes(
                    'The play() request was interrupted by a new load request',
                );

                if (!isBenignError) {
                    throw error;
                }
            }
        }
    }

    async function createOffer() {
        await rtcWrapper.createOffer();

        updateRtcEvents(rtcRelatedState, [
            {
                content: `Offer created: ${rtcWrapper.sessionInit?.sdp?.substring(0, 15)}...`,
                isPseudoEvent: true,
                timestamp: new Date(),
            },
        ]);
    }

    async function createAnswer() {
        await rtcWrapper.createAnswer();

        updateRtcEvents(rtcRelatedState, [
            {
                content: `Answer created: ${rtcWrapper.sessionInit?.sdp?.substring(0, 15)}...`,
                isPseudoEvent: true,
                timestamp: new Date(),
            },
        ]);
    }

    async function setLocalDescription() {
        await rtcWrapper.setLocalDescription();
        // No need to forceUpdate, as RTCEvents will be triggered
    }

    async function setRemoteDescription() {
        await rtcWrapper.setRemoteDescription(JSON.parse(remoteSessionInit || '{}'));
        // No need to forceUpdate, as RTCEvents will be triggered
    }

    async function setRemoteIceCandidatesHandler() {
        await rtcWrapper.setRemoteICECandidates(JSON.parse(remoteIceCandidates || '[]'));

        setHasAddedRemoteCandidates(true);
        updateRtcEvents(rtcRelatedState, [
            {
                content: `Remote ICE Candidates added`,
                isPseudoEvent: true,
                timestamp: new Date(),
            },
        ]);
    }

    function closeDataChannel() {
        rtcWrapper.closeDataChannel();
        // No need to forceUpdate, as RTCEvents will be triggered
    }

    function stopMediaStream(
        elementRef: RefObject<HTMLVideoElement>,
        mediaStream: MediaStream | null,
        label: string,
    ) {
        let newEvents: RTCEvent[] = [];

        if (elementRef.current) {
            elementRef.current.srcObject = null;
        }

        if (mediaStream) {
            mediaStream.getTracks().forEach((track) => {
                track.stop();
            });

            newEvents = mediaStream
                .getTracks()
                .map<RTCEvent>((track) => ({
                    content: `${label} ${track.kind} stream track ended`,
                    isPseudoEvent: true,
                    timestamp: new Date(),
                }))
                .reverse();
        }

        return newEvents;
    }

    function stopLocalMediaStream() {
        const newEvents = stopMediaStream(localVideoRef, rtcRelatedState.localMediaStream, 'Local');

        updateRtcRelatedState(rtcRelatedState, {
            localMediaStream: null,
            newEvents,
        });
    }

    function stopRemoteMediaStream() {
        const newEvents = stopMediaStream(
            remoteVideoRef,
            rtcRelatedState.remoteMediaStream,
            'Remote',
        );

        updateRtcRelatedState(rtcRelatedState, {
            newEvents,
            remoteMediaStream: null,
        });
    }

    function closeConnection(currentRtcDrivenState: RTCRelatedState, label: string) {
        const newEvents: RTCEvent[] = [
            {
                content: `Connection closed by ${label} peer`,
                isPseudoEvent: true,
                timestamp: new Date(),
            },
        ];

        const localMediaEvents = stopMediaStream(
            localVideoRef,
            currentRtcDrivenState.localMediaStream,
            'Local',
        );
        const remoteMediaEvents = stopMediaStream(
            remoteVideoRef,
            currentRtcDrivenState.remoteMediaStream,
            'Remote',
        );

        newEvents.unshift(...localMediaEvents, ...remoteMediaEvents);

        rtcWrapper.closeConnection();

        updateRtcRelatedState(currentRtcDrivenState, {
            localMediaStream: null,
            newEvents,
            remoteMediaStream: null,
        });
    }

    function clear() {
        rtcWrapper.clear();

        setHasAddedRemoteCandidates(false);
        setMessage('');
        setRemoteIceCandidates('');
        setRemoteSessionInit('');
        setRtcRelatedState(getInitialRtcRelatedState());
    }

    const disableInitialize = !!rtcWrapper.connection;
    const disableCreateDataChannel = !rtcWrapper.isNewStatus || !!rtcWrapper.dataChannel;
    const disableCreateStream =
        localMediaStreamLoading ||
        !!rtcRelatedState.localMediaStream ||
        !(rtcWrapper.isNewStatus || (rtcWrapper.hasRemoteOffer && hasAddedRemoteCandidates));
    const disableCreateOffer =
        !rtcWrapper.isNewStatus || (!rtcWrapper.dataChannel && !rtcRelatedState.localMediaStream);
    const disableCreateAnswer = !rtcWrapper.hasRemoteOffer || !hasAddedRemoteCandidates;
    const disableSetLocalDescription =
        !rtcWrapper.sessionInit || (!rtcWrapper.isNewStatus && !rtcWrapper.hasRemoteOffer);
    const disableSetRemoteDescription = !(
        (!rtcWrapper.sessionInit && rtcWrapper.isNewStatus) ||
        (!!rtcWrapper.sessionInit && rtcWrapper.awaitingRemoteAnswer)
    );
    const disableSetRemoteICECandidates =
        hasAddedRemoteCandidates || !!rtcWrapper.sessionInit || !rtcWrapper.hasRemoteOffer;
    const disableCloseConnection = !rtcWrapper.isConnectedStatus;
    const disableSendData = !rtcWrapper.isConnectedStatus || !rtcWrapper.dataChannel;
    const disableClear = !rtcWrapper.isClosedStatus;

    const displaySessionInstructions =
        rtcWrapper.hasLocalOffer || rtcWrapper.awaitingAnswerAcceptance;
    const displayICECandidatesInstructions = rtcWrapper.hasLocalOffer;

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
                    Connection status: {rtcWrapper.connection?.connectionState || '-'} /{' '}
                    {rtcWrapper.connection?.signalingState || '-'}
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
                        value={rtcWrapper.sessionInit ? JSON.stringify(rtcWrapper.sessionInit) : ''}
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
                            rtcWrapper.iceCandidates?.length > 0
                                ? JSON.stringify(rtcWrapper.iceCandidates)
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
                        <button
                            onClick={stopLocalMediaStream}
                            disabled={!rtcRelatedState.localMediaStream}
                        >
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
                        <button
                            onClick={stopRemoteMediaStream}
                            disabled={!rtcRelatedState.remoteMediaStream}
                        >
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
                        rtcWrapper.dataChannel!.send(message);

                        setMessage('');
                        updateRtcEvents(rtcRelatedState, [
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
                <button
                    onClick={() => closeConnection(rtcRelatedState, 'local')}
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
                {rtcRelatedState.connectionEvents.map((cEvent, index) => (
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
