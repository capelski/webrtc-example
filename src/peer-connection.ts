import { Subject } from 'rxjs';

export type PeerConnectionData = {
    candidate: RTCIceCandidate;
    sessionInit: RTCSessionDescriptionInit;
};

export type PeerConnectionEventHandlers = {
    onIceCandidate?: Subject<PeerConnectionData>;
    onDataChannelReady?: Subject<RTCDataChannel>;
    onMessageReceived?: Subject<string>;
};

export class PeerConnection {
    public connection: RTCPeerConnection;
    public sessionInit: RTCSessionDescriptionInit;
    public channel: RTCDataChannel;
    public latestIceCandidate: RTCIceCandidate;

    public onIceCandidate: Subject<PeerConnectionData>;
    public onDataChannelReady: Subject<RTCDataChannel>;
    public onMessageReceived: Subject<string>;

    constructor(channelName: string, eventHandlers: PeerConnectionEventHandlers = {}) {
        this.onIceCandidate = eventHandlers.onIceCandidate || new Subject<PeerConnectionData>();
        this.onDataChannelReady = eventHandlers.onDataChannelReady || new Subject<RTCDataChannel>();
        this.onMessageReceived = eventHandlers.onMessageReceived || new Subject<string>();

        this.connection = new RTCPeerConnection();

        this.connection.onicecandidate = (event) => {
            if (event.candidate) {
                // The event.candidate must be added by the other peer of the connection;
                // in this case, the peer will copy it form one tab and paste it to another
                this.latestIceCandidate = event.candidate;
                this.onIceCandidate.next({
                    candidate: event.candidate,
                    sessionInit: this.sessionInit,
                });
            }
        };

        // The connection must create a channel before offering for the iceCandidates to be generated
        this.channel = this.connection.createDataChannel(channelName);
        // this.channel.onopen = () => {
        //   console.log('Sending channel opened')
        // };
        // this.channel.onclose = () => {
        //   console.log('Sending channel closed')
        // };

        // If the peer has created a channel, this method will be called upon connection established
        this.connection.ondatachannel = (event) => {
            const receiveChannel = event.channel;
            this.onDataChannelReady.next(receiveChannel);
            receiveChannel.onmessage = (event) => {
                this.onMessageReceived.next(event.data);
            };
            // receiveChannel.onopen = () => {
            //     console.log('Receiving channel opened');
            // };
            // receiveChannel.onclose = () => {
            //     console.log('Receiving channel closed');
            // };
        };
    }

    get connectionData(): PeerConnectionData {
        return {
            candidate: this.latestIceCandidate,
            sessionInit: this.sessionInit,
        };
    }

    async generateOffer() {
        this.sessionInit = await this.connection.createOffer(); // This operation will generate many ice candidates
        await this.connection.setLocalDescription(this.sessionInit);
        return this.sessionInit;
    }

    async setPeerData(peerConnectionData: PeerConnectionData) {
        await this.connection.setRemoteDescription(peerConnectionData.sessionInit);
        await this.connection.addIceCandidate(peerConnectionData.candidate);
    }

    async generateAnswer() {
        this.sessionInit = await this.connection.createAnswer(); // This operation will generate many ice candidates
        await this.connection.setLocalDescription(this.sessionInit);
        return this.sessionInit;
    }

    send(data: string) {
        return this.channel.send(data);
    }
}
