export enum RTCWrapperEvents {
    answerCreated = 'onAnswerCreated',
    connectionEnded = 'onConnectionEnded',
    connectionStateChange = 'onConnectionStateChange',
    iceCandidate = 'onIceCandidate',
    messageReceived = 'onMessageReceived',
    offerCreated = 'onOfferCreated',
    receiveChannelClosed = 'onReceiveChannelClosed',
    receiveChannelOpened = 'onReceiveChannelOpened',
    sendChannelClosed = 'onSendChannelClosed',
    sendChannelOpened = 'onSendChannelOpened',
    signalingStateChange = 'onSignalingStateChange',
}

export type RTCWrapperHandlers = {
    [RTCWrapperEvents.answerCreated]: (event: CustomEvent<RTCSessionDescriptionInit>) => void;
    [RTCWrapperEvents.connectionStateChange]: (event: CustomEvent<RTCPeerConnectionState>) => void;
    [RTCWrapperEvents.iceCandidate]: (event: CustomEvent<RTCIceCandidate>) => void;
    [RTCWrapperEvents.messageReceived]: (event: CustomEvent<string>) => void;
    [RTCWrapperEvents.offerCreated]: (event: CustomEvent<RTCSessionDescriptionInit>) => void;
    [RTCWrapperEvents.receiveChannelClosed]: (event: CustomEvent<undefined>) => void;
    [RTCWrapperEvents.receiveChannelOpened]: (event: CustomEvent<RTCDataChannel>) => void;
    [RTCWrapperEvents.sendChannelClosed]: (event: CustomEvent<undefined>) => void;
    [RTCWrapperEvents.sendChannelOpened]: (event: CustomEvent<RTCDataChannel>) => void;
    [RTCWrapperEvents.signalingStateChange]: (event: CustomEvent<RTCSignalingState>) => void;
};

export class RTCWrapper {
    public readonly connection: RTCPeerConnection;
    public readonly events: EventTarget;
    protected handlers?: Partial<RTCWrapperHandlers>;

    public sessionInit?: RTCSessionDescriptionInit;
    public iceCandidate?: RTCIceCandidate;
    public sendChannel?: RTCDataChannel;
    public receiveChannel?: RTCDataChannel;

    constructor() {
        this.events = new EventTarget();

        this.connection = new RTCPeerConnection();

        this.connection.onconnectionstatechange = () => {
            this.events.dispatchEvent(
                new CustomEvent(RTCWrapperEvents.connectionStateChange, {
                    detail: this.connection.connectionState,
                }),
            );
        };

        this.connection.onsignalingstatechange = () => {
            this.events.dispatchEvent(
                new CustomEvent(RTCWrapperEvents.signalingStateChange, {
                    detail: this.connection.signalingState,
                }),
            );
        };

        this.connection.onicecandidate = (event) => {
            if (event.candidate) {
                // The event.candidate must be added by the other peer of the connection;
                // in this case, the peer will copy it form one tab and paste it to another
                this.iceCandidate = event.candidate;
                this.events.dispatchEvent(
                    new CustomEvent(RTCWrapperEvents.iceCandidate, {
                        detail: event.candidate,
                    }),
                );
            }
        };

        // If the peer has created a channel, this method will be called upon connection established
        this.connection.ondatachannel = (event) => {
            this.receiveChannel = event.channel;

            event.channel.onmessage = (event) => {
                this.events.dispatchEvent(
                    new CustomEvent(RTCWrapperEvents.messageReceived, {
                        detail: event.data,
                    }),
                );
            };
            event.channel.onopen = () => {
                this.events.dispatchEvent(
                    new CustomEvent(RTCWrapperEvents.receiveChannelOpened, {
                        detail: this.receiveChannel,
                    }),
                );
            };
            event.channel.onclose = () => {
                this.events.dispatchEvent(
                    new CustomEvent(RTCWrapperEvents.receiveChannelClosed, {
                        detail: undefined,
                    }),
                );
                this.receiveChannel = undefined;
            };
        };
    }

    get isNewStatus() {
        return (
            this.connection.connectionState === 'new' && this.connection.signalingState === 'stable'
        );
    }

    get hasRemoteOffer() {
        return (
            this.connection.connectionState === 'new' &&
            this.connection.signalingState === 'have-remote-offer'
        );
    }

    get awaitingRemoteAnswer() {
        return (
            this.connection.connectionState === 'connecting' &&
            this.connection.signalingState === 'have-local-offer'
        );
    }

    get isConnectedStatus() {
        return this.connection.connectionState === 'connected';
    }

    get isClosedStatus() {
        return (
            this.connection.connectionState === 'closed' &&
            this.connection.signalingState === 'closed'
        );
    }

    createSendChannel(name: string) {
        // If a send channel is needed, it must be created before offering/answering a session
        this.sendChannel = this.connection.createDataChannel(name);
        this.sendChannel.onopen = () => {
            this.events.dispatchEvent(
                new CustomEvent(RTCWrapperEvents.sendChannelOpened, {
                    detail: this.sendChannel,
                }),
            );
        };
        this.sendChannel.onclose = () => {
            this.events.dispatchEvent(
                new CustomEvent(RTCWrapperEvents.sendChannelClosed, {
                    detail: undefined,
                }),
            );
            this.sendChannel = undefined;
        };
    }

    async setOffer() {
        this.sessionInit = await this.connection.createOffer();
        this.events.dispatchEvent(
            new CustomEvent(RTCWrapperEvents.offerCreated, {
                detail: this.sessionInit,
            }),
        );
        // This operation will generate several ice candidates if a channel has been created by this peer
        // and an internet connection is available
        await this.connection.setLocalDescription(this.sessionInit);
        return this.sessionInit;
    }

    async setRemoteData(sessionInit: RTCSessionDescriptionInit, candidate?: RTCIceCandidate) {
        await this.connection.setRemoteDescription(sessionInit);
        await this.connection.addIceCandidate(candidate);
    }

    async setAnswer() {
        this.sessionInit = await this.connection.createAnswer();
        this.events.dispatchEvent(
            new CustomEvent(RTCWrapperEvents.answerCreated, {
                detail: this.sessionInit,
            }),
        );
        // This operation will generate several ice candidates if a channel has been created by either peer
        // and an internet connection is available
        await this.connection.setLocalDescription(this.sessionInit);
        return this.sessionInit;
    }

    async closeConnection() {
        if (this.sendChannel) {
            this.sendChannel.close();
        }
        if (this.receiveChannel) {
            this.receiveChannel.close();
        }
        this.sendChannel = undefined;
        this.receiveChannel = undefined;
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
}
