export type RTCEvent = {
    content: string;
    isPseudoEvent?: boolean;
    timestamp: Date;
};

export type RTCRelatedState = {
    connectionEvents: RTCEvent[];
    localMediaStream: MediaStream | null;
    remoteMediaStream: MediaStream | null;
};

export type RTCRelatedStateUpdate = {
    localMediaStream?: MediaStream | null;
    newEvents?: RTCEvent[];
    remoteMediaStream?: MediaStream | null;
};

export const getInitialRtcRelatedState = (): RTCRelatedState => ({
    connectionEvents: [],
    localMediaStream: null,
    remoteMediaStream: null,
});

export const getNextRTCRelatedState = (
    currentState: RTCRelatedState,
    stateUpdates: RTCRelatedStateUpdate,
): RTCRelatedState => ({
    connectionEvents: (stateUpdates.newEvents || []).concat(currentState.connectionEvents),
    localMediaStream:
        stateUpdates.localMediaStream === undefined
            ? currentState.localMediaStream
            : stateUpdates.localMediaStream,
    remoteMediaStream:
        stateUpdates.remoteMediaStream === undefined
            ? currentState.remoteMediaStream
            : stateUpdates.remoteMediaStream,
});
