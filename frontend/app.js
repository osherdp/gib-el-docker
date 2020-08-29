import React from "react";
import axios from "axios";
import io from 'socket.io-client';
import Cookies from 'universal-cookie';
import TextField from "@material-ui/core/TextField";
import Stepper from '@material-ui/core/Stepper';
import Step from '@material-ui/core/Step';
import StepLabel from '@material-ui/core/StepLabel';
import LinearProgress from "@material-ui/core/LinearProgress";

import logo from "./logo.png";
import "./style.scss";
import Button from "@material-ui/core/Button";
import StepConnector from "@material-ui/core/StepConnector";
import withStyles from "@material-ui/core/styles/withStyles";
import Typography from "@material-ui/core/Typography";


const styles = theme => ({
    root: {
        width: '90%',
    },
    button: {
        marginRight: theme.spacing(1),
    },
    instructions: {
        marginTop: theme.spacing(1),
        marginBottom: theme.spacing(1),
    },
    connectorActive: {
        '& $connectorLine': {
            borderColor: theme.palette.secondary.main,
        },
    },
    connectorCompleted: {
        '& $connectorLine': {
            borderColor: theme.palette.primary.main,
        },
    },
    connectorDisabled: {
        '& $connectorLine': {
            borderColor: theme.palette.grey[100],
        },
    },
    connectorLine: {
        transition: theme.transitions.create('border-color'),
    },
});


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
        this.state = {
            active_step: 0,
            pull_index: undefined,
            pull_total: 1,
            pull_current_bytes: undefined,
            pull_total_bytes: 1,
            is_valid: false,
            is_failed: false,
            failed_message: "",
            compress_log: ""
        };
        this.steps = [
            'Choose an image',
            'Pulling from Docker Hub',
            'Compressing image',
            'Downloading to client'
        ];
        this.cancel_source = undefined;
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
        this.socket.on('start_compress', () => {
            this.setState({
                ...this.state,
                active_step: 2
            })
        });
        this.socket.on('compress_progress', (data) => {
            console.log(data);
            this.setState({
                ...this.state,
                compress_log: data.line
            });
        });
        this.socket.on('pull_progress', (data) => {
            this.setState({
                ...this.state,
                pull_index: data.index,
                pull_total: data.total,
                pull_current_bytes: data.current_bytes,
                pull_total_bytes: data.total_bytes,
            });
            console.log(data)
        });
        this.socket.off("pull_done");
        this.socket.on("pull_done", (data) => {
            console.log(data);
            const path = data.tar_path;
            this.pullDone();
            const link = document.createElement('a');
            link.href = `/api/download/${path}`;
            link.setAttribute('download', path);
            document.body.appendChild(link);
            link.click();
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

    onChange = (event) => {
        this.actual_name = event.target.value;
        if (this.cancel_source) {
            this.cancel_source.cancel("Another request sent");
        }
        this.cancel_source = axios.CancelToken.source();
        axios.get(`/api/exists/${this.actual_name}`, {
            cancelToken: this.cancel_source.token
        }).then(
            (data) => {
                console.log("request sent");
                console.log(data);
                this.setState({
                    ...this.state,
                    is_valid: data.data.exists
                });
            }
        ).catch((thrown) => {
            if (axios.isCancel(thrown)) {
                console.log('Request canceled', thrown.message);
            }
        });
    };

    validateImage = () => {
        axios.get(`/api/exists/${this.actual_name}`).then(
            (data) => {
                console.log("request sent");
                console.log(data);
                if (data.data.exists) {
                    this.startDownload();
                } else {
                    this.setState({
                        ...this.state,
                        is_failed: true,
                        failed_message: "Validation failed!"
                    });
                }
            }
        );
    };

    startDownload = () => {
        this.setState({
            ...this.state,
            active_step: 1
        });
        console.log(this.actual_name);
        axios.get(`/api/pull/${this.sid}/${this.actual_name}`).then(
            (data) => {
                console.log("request sent");
                console.log(data);
            }
        );
    };

    pullDone = () => {
        this.setState({
            ...this.state,
            active_step: 4
        })
    };

    downloadAnother = () => {
        this.setState({
            ...this.state,
            active_step: 0,
            is_failed: false,
            pull_index: undefined,
            failed_message: "",
            is_valid: false,
            compress_log: "",
            pull_current_bytes: undefined,
            pull_total_bytes: 1,
        })
    };

    renderComponent() {
        switch (this.state.active_step) {
            case 0:
                return (
                    <React.Fragment>
                        <form onSubmit={this.startDownload}
                              className="submit_form">
                            <TextField
                                id="outlined-name"
                                label="Image Name"
                                onChange={this.onChange}
                                margin="normal"
                                variant="outlined"
                                className="input-field"
                            />
                            <Button
                                variant="contained"
                                color="primary"
                                type="submit"
                                disabled={!this.state.is_valid}
                            >
                                Download Now
                            </Button>
                        </form>
                    </React.Fragment>
                );
            case 1:
                return (
                    <React.Fragment>

                        <LinearProgress
                            variant={this.state.pull_index !== undefined ? "determinate" : undefined}
                            value={this.state.pull_index !== undefined ? this.state.pull_index * 100 / this.state.pull_total : undefined}/>
                        <Typography component="h4" variant="subtitle1"
                                    color="textSecondary"
                                    style={{
                                        margin: "auto"
                                    }}>
                            {this.state.pull_index === undefined ? "Loading..." :
                                `Layer ${this.state.pull_index + 1} / ${this.state.pull_total}`}
                        </Typography>
                        <LinearProgress
                            variant={this.state.pull_index !== undefined ? "determinate" : undefined}
                            color="secondary"
                            value={this.state.pull_current_bytes * 100 / this.state.pull_total_bytes}
                        />
                        {/*<Typography component="h5" variant="h5">*/}
                        {/*    {this.state.pull_index !== undefined ? "" :*/}
                        {/*      `${this.state.pull_current_bytes * 100 / this.state.pull_total_bytes} %`}*/}
                        {/*</Typography>*/}
                    </React.Fragment>
                );
            case 2:
                return (
                    <React.Fragment>
                        <LinearProgress/>
                        <Typography variant="caption" style={{
                            margin: "auto"
                        }}>{this.state.compress_log}</Typography>
                    </React.Fragment>
                );

            default:
                return (
                    <Button variant="contained" color="primary"
                            onClick={this.downloadAnother}>
                        Download Another
                    </Button>
                )
        }
    }

    get connector() {
        const {classes} = this.props;
        return (<StepConnector classes={{
            active: classes.connectorActive,
            completed: classes.connectorCompleted,
            disabled: classes.connectorDisabled,
            line: classes.connectorLine,
        }}
        />);
    }

    render() {

        return (
            <div className="container">
                <div className="logo">
                    <img src={logo}/>
                </div>
                <Stepper activeStep={this.state.active_step} alternativeLabel
                         connector={this.connector}>
                    {this.steps.map((label, index) => {
                        return (
                            <Step key={label}>
                                <StepLabel>{label}</StepLabel>
                            </Step>
                        );
                    })}
                </Stepper>
                {this.renderComponent()}
            </div>
        );
    }
}

export default withStyles(styles)(App);
