export enum RTCWrapperEvents {
    connectionStateChange = 'onConnectionStateChange',
    dataChannelClosed = 'onDataChannelClosed',
    dataChannelOpened = 'onDataChannelOpened',
    localIceCandidate = 'onLocalIceCandidate',
    messageReceived = 'onMessageReceived',
    remoteTrackAdded = 'onRemoteTrackAdded',
    signalingStateChange = 'onSignalingStateChange',
}

export type RTCWrapperHandlers = {
    [RTCWrapperEvents.connectionStateChange]: (event: CustomEvent<RTCPeerConnectionState>) => void;
    [RTCWrapperEvents.dataChannelClosed]: (event: CustomEvent<RTCDataChannel>) => void;
    [RTCWrapperEvents.dataChannelOpened]: (event: CustomEvent<RTCDataChannel>) => void;
    [RTCWrapperEvents.localIceCandidate]: (event: CustomEvent<RTCIceCandidate>) => void;
    [RTCWrapperEvents.messageReceived]: (event: CustomEvent<string>) => void;
    [RTCWrapperEvents.remoteTrackAdded]: (event: CustomEvent<MediaStreamTrack>) => void;
    [RTCWrapperEvents.signalingStateChange]: (event: CustomEvent<RTCSignalingState>) => void;
};

export class RTCWrapper {
    public connection?: RTCPeerConnection;
    public readonly events: EventTarget;
    protected handlers?: Partial<RTCWrapperHandlers>;

    public sessionInit?: RTCSessionDescriptionInit;
    public iceCandidates: RTCIceCandidate[] = [];

    public dataChannel?: RTCDataChannel;

    constructor() {
        this.events = new EventTarget();
    }

    initialize() {
        this.connection = new RTCPeerConnection();

        this.connection.onconnectionstatechange = () => {
            this.events.dispatchEvent(
                new CustomEvent(RTCWrapperEvents.connectionStateChange, {
                    detail: this.connection!.connectionState,
                }),
            );
        };

        this.connection.onsignalingstatechange = () => {
            this.events.dispatchEvent(
                new CustomEvent(RTCWrapperEvents.signalingStateChange, {
                    detail: this.connection!.signalingState,
                }),
            );
        };

        this.connection.onicecandidate = (event) => {
            if (event.candidate) {
                // The event.candidate must be added by the peer answering the connection
                this.iceCandidates.push(event.candidate);
                this.events.dispatchEvent(
                    new CustomEvent(RTCWrapperEvents.localIceCandidate, {
                        detail: event.candidate,
                    }),
                );
            }
        };

        // This method will be called when the peer creates a channel
        this.connection.ondatachannel = (event) => {
            this.dataChannel = event.channel;
            this.processDataChannel(this.dataChannel);
        };

        // This method will be called when the peer adds a stream track
        this.connection.ontrack = (event) => {
            this.events.dispatchEvent(
                new CustomEvent(RTCWrapperEvents.remoteTrackAdded, {
                    detail: event.track,
                }),
            );
        };
    }

    get isNewStatus() {
        return (
            this.connection &&
            this.connection.connectionState === 'new' &&
            this.connection.signalingState === 'stable'
        );
    }

    get hasLocalOffer() {
        return (
            this.connection &&
            this.connection.connectionState === 'new' &&
            this.connection.signalingState === 'have-local-offer'
        );
    }

    get hasRemoteOffer() {
        return (
            this.connection &&
            this.connection.connectionState === 'new' &&
            this.connection.signalingState === 'have-remote-offer'
        );
    }

    get awaitingRemoteAnswer() {
        return (
            this.connection &&
            this.connection.connectionState === 'connecting' &&
            this.connection.signalingState === 'have-local-offer'
        );
    }

    get awaitingAnswerAcceptance() {
        return (
            this.connection &&
            this.connection.connectionState === 'connecting' &&
            this.connection.signalingState === 'stable'
        );
    }

    get isConnectedStatus() {
        return this.connection && this.connection.connectionState === 'connected';
    }

    get isClosedStatus() {
        return (
            this.connection &&
            this.connection.connectionState === 'closed' &&
            this.connection.signalingState === 'closed'
        );
    }

    private processDataChannel(dataChannel: RTCDataChannel) {
        dataChannel.onopen = () => {
            this.events.dispatchEvent(
                new CustomEvent(RTCWrapperEvents.dataChannelOpened, {
                    detail: dataChannel,
                }),
            );
        };

        dataChannel.onmessage = (event) => {
            this.events.dispatchEvent(
                new CustomEvent(RTCWrapperEvents.messageReceived, {
                    detail: event.data,
                }),
            );
        };

        dataChannel.onclose = () => {
            this.events.dispatchEvent(
                new CustomEvent(RTCWrapperEvents.dataChannelClosed, {
                    detail: this.dataChannel,
                }),
            );
            this.dataChannel = undefined;
        };
    }

    createDataChannel(name: string) {
        if (!this.connection) {
            throw new Error("The RTC connection hasn't been initialized");
        }

        this.dataChannel = this.connection.createDataChannel(name);
        this.processDataChannel(this.dataChannel);
    }

    async addUserMediaTracks(tracks: MediaStreamTrack[]) {
        if (!this.connection) {
            throw new Error("The RTC connection hasn't been initialized");
        }

        tracks.forEach((track) => {
            return this.connection!.addTrack(track);
        });
    }

    async createOffer() {
        if (!this.connection) {
            throw new Error("The RTC connection hasn't been initialized");
        }

        this.sessionInit = await this.connection.createOffer();
        return this.sessionInit;
    }

    setLocalDescription() {
        if (!this.connection) {
            throw new Error("The RTC connection hasn't been initialized");
        }

        // This operation will generate several ice candidates if a channel has been created by either peer
        // and an internet connection is available
        return this.connection.setLocalDescription(this.sessionInit);
    }

    async setRemoteDescription(sessionInit: RTCSessionDescriptionInit) {
        if (!this.connection) {
            throw new Error("The RTC connection hasn't been initialized");
        }

        await this.connection.setRemoteDescription(sessionInit);
    }

    async setRemoteICECandidates(candidates: RTCIceCandidate[]) {
        if (!this.connection) {
            throw new Error("The RTC connection hasn't been initialized");
        }

        for (let candidate of candidates) {
            await this.connection.addIceCandidate(candidate);
        }
    }

    async createAnswer() {
        if (!this.connection) {
            throw new Error("The RTC connection hasn't been initialized");
        }

        this.sessionInit = await this.connection.createAnswer();
        return this.sessionInit;
    }

    closeDataChannel() {
        this.dataChannel?.close();
    }

    closeConnection() {
        if (!this.connection) {
            throw new Error("The RTC connection hasn't been initialized");
        }

        this.connection.close();
    }

    setEventHandlers(handlers: Partial<RTCWrapperHandlers>) {
        Object.keys(handlers).forEach((eventName: keyof RTCWrapperHandlers) => {
            if (this.handlers?.[eventName]) {
                this.events.removeEventListener(eventName, this.handlers![eventName]!);
            }
            this.events.addEventListener(eventName, handlers[eventName]!);
        });

        this.handlers = handlers;
    }

    unsetEventHandlers() {
        if (this.handlers) {
            Object.keys(this.handlers).forEach((eventName: keyof RTCWrapperHandlers) => {
                this.events.removeEventListener(eventName, this.handlers![eventName]!);
            });

            this.handlers = undefined;
        }
    }

    clear() {
        this.connection = undefined;
        this.sessionInit = undefined;
        this.iceCandidates = [];

        this.unsetEventHandlers();
        this.handlers = undefined;
    }
}
