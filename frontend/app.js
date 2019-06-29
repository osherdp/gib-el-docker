import React from "react";
import axios from "axios";
import io from 'socket.io-client';
import Cookies from 'universal-cookie';
import {DownloadButton} from "./button";
import TextField from "@material-ui/core/TextField";

import logo from "./logo.png";
import "./style.scss";

class App extends React.Component {

    constructor(props) {
        super(props);
        this.state = {};
        this.socket = io();
        this.bindSocket();
        this.sid = undefined;
        this.image_name = React.createRef();
        this.actual_name = "";
        this.cookies = new Cookies();
    }

    componentDidMount() {

    }

    download() {
        axios.get(`/api/pull/${this.sid}/library/ubuntu:16.04`).then((data) => {
            console.log("request sent");
            console.log(data);
        });
    }

    bindSocket() {
        this.socket.on('connect', function () {
            console.log("connected!")
        });
        this.socket.on('set_sid', (data) => {
            console.log(data);
            let room_id = data.sid;
            const cookie_room = this.cookies.get('room_id');
            console.log(cookie_room);
            if (!cookie_room) {
                this.cookies.set('room_id', data.sid);
            } else {
                room_id = cookie_room;
            }

            this.sid = room_id;
            this.socket.emit("join", {"room": room_id});
        });

        this.socket.on('event', function (data) {
            console.log(`event:`, data)
        });
        this.socket.on('message', function (data) {
            console.log(`message:`, data)
        });
        this.socket.on('disconnect', function () {
            console.log("disconnected!")
        });
    }

    getImageValue = () => {
        return this.actual_name;
    };

    getSID = () => {
        return this.sid;
    };

    onChange = () => {
        this.actual_name = event.target.value;
    };

    render() {
        return (
            <div className="container">
                <div className="logo">
                    <img src={logo}/>
                </div>
                <TextField
                    id="outlined-name"
                    label="Image Name"
                    onChange={this.onChange}
                    margin="normal"
                    variant="outlined"
                    className="input-field"
                />
                <DownloadButton getValue={this.getImageValue}
                                className="download-button"
                                socket={this.socket} getSID={this.getSID}/>
            </div>
        );
    }
}

export default App;
