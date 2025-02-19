const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = process.env.PORT || 3000;
const { networkInterfaces } = require('os');

const nets = networkInterfaces();
const ipv4_addr = {};

for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
        // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
        // 'IPv4' is in Node <= 17, from 18 it's a number 4 or 6
        const familyV4Value = typeof net.family === 'string' ? 'IPv4' : 4
        if (net.family === familyV4Value && !net.internal) {
            if (!ipv4_addr[name]) {
                ipv4_addr[name] = [];
            }
            ipv4_addr[name].push(net.address);
        }
    }
}

let ip = "127.0.0.1";
if (ipv4_addr['Wi-Fi']){
    ip = ipv4_addr['Wi-Fi'];
}
    
let ID_LEN = 6;
let signalHandler = new Map();
let availableHandler = [];
// let availableSignal = [];
let startUp = Date.now() / 1000;

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
    console.log('[', Date(Date.now()).toString(), '] user ' + socket.id + ' connected, Online user count:', Object.keys(io.sockets.sockets).length);
    let uid = null;
    let emitUID = null;
    let user_type = null;

    socket.on('chat message', (msg) => {
        io.emit('chat message', msg);
    });

    socket.on('inferenceRegister', () => {
        user_type = 'inference_server';
        socket.join('inferenceNode');
        socket.on('inferenceResult', (res) => {
            io.emit("chat message", res.uid + ": " + res.action);
            io.to('players').emit(res.uid + '_action', res.action);
        });
        console.log("Inference server is online.");
    });

    socket.on('eventHandlerRegister', () => {
        user_type = 'unity_event_handler';
        socket.join('players');
        console.log("A player joined the room.");
    });

    // socket.on('remoteSignalRegister', () => { //ISSUE: how to connect with specific player?
    //     if (availableHandler.length > 0){
    //         id = availableHandler.pop();
    //         availableSignal.push(id);
    //         emitUID = id;
    //         socket.emit('registerInfo', id);
    //         socket.on(id, (rcv) => {
    //             io.to(id).emit("r" + id, rcv);
    //         });
    //     }
    //     else{
    //         socket.emit('registerInfo', 'No client available.');
    //     }
    // });

    socket.on('signalHandlerRegister', (info) => {
        // let id = make_id(info['time']);
        let id = info['localIP'];
        user_type = 'signal_handler';
        signalHandler.set(id, info['time']);
        uid = id;
        availableHandler.push(id);
        socket.join(id);
        socket.emit('registerInfo', id);
        io.to('inferenceNode').emit('whiteList', {'uid': id, 'stamp': info['time']});
        socket.on('inferenceRequest', (req) => {
            if (signalHandler.has(req.uid)){
                io.to('inferenceNode').emit('inference', req);
            }
        });
        console.log( signalHandler.size + " signal handler is available.");
    });

    socket.on('reconnect', () =>{
        console.log(user_type + "reconnected.");
        switch(user_type){
            case 'inference_server':
                socket.join('inferenceNode');
                socket.on('inferenceResult', (res) => {
                    io.emit("chat message", res.uid + ": " + res.action);
                    io.to('players').emit(res.uid + '_action', res.action);
                });
                break;
            case 'unity_event_handler':
                socket.join('players');
                break;
            case 'signal_handler':
                socket.join(id);
                socket.on('inferenceRequest', (req) => {
                    if (signalHandler.has(req.uid)){
                        io.to('inferenceNode').emit('inference', req);
                    }
                });
                break;
            default:
                socket.disconnect();
        }
    });

    socket.on('disconnect', () => {
        if (uid != null && signalHandler.has(uid)){
            signalHandler.delete(uid);
            io.to('inferenceNode').emit('rmWhiteList', uid);
        }
        if (emitUID != null && signalHandler.has(emitUID)){
            availableID.push(emitUID);
        }
        console.log('[', Date(Date.now()).toString(), '] ' + user_type + ' disconnected, Online user count:', Object.keys(io.sockets.sockets).length);
    });
});

http.listen(port, ip, () => {
    console.log(`Socket.IO server running at http://${ip}:${port}/`);
});

function make_id(data){
    let t = (Number(data) - startUp).toString(16).split('.');
    let f = t[0];
    let b = t[1];
    while(b.length < ID_LEN){
        for (let i = 0; i < f.length; i++){
            if (b.length < ID_LEN){
                b = b + f[i];
            }
        }
    }
    return b;
}