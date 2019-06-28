import clsx from 'clsx';
import React from 'react';
import axios from "axios";
import Button from '@material-ui/core/Button';
import {green} from '@material-ui/core/colors';
import {makeStyles} from '@material-ui/core/styles';
import CircularProgress from '@material-ui/core/CircularProgress';

const useStyles = makeStyles(theme => ({
    root: {
        display: 'flex',
        alignItems: 'center',
        margin: "auto"
    },
    wrapper: {
        margin: theme.spacing(1),
        position: 'relative',
    },
    buttonSuccess: {
        backgroundColor: green[500],
        '&:hover': {
            backgroundColor: green[700],
        },
    },
    fabProgress: {
        color: green[500],
        position: 'absolute',
        top: -6,
        left: -6,
        zIndex: 1,
    },
    buttonProgress: {
        color: green[500],
        position: 'absolute',
        top: '50%',
        left: '50%',
        marginTop: -12,
        marginLeft: -12,
    },
}));

export const DownloadButton = (props) => {
    const classes = useStyles();
    const [loading, setLoading] = React.useState(false);
    const [success, setSuccess] = React.useState(false);
    const [disabled, setDisabled] = React.useState(false);
    props.socket.off("pull_done");
    props.socket.on("pull_done", (data) => {
        console.log(data);
        setSuccess(true);
        setLoading(false);
        const path = data.tar_path;
        axios.get(`/api/download/${path}`, {
            responseType: "blob"
        }).then((data) => {
            console.log(data);
            const url = window.URL.createObjectURL(new Blob([data.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', path);
            document.body.appendChild(link);
            link.click();
        });
    });
    React.useEffect(() => {
        return () => {
        };
    }, []);

    function handleButtonClick() {
        if (!loading) {
            setSuccess(false);
            setLoading(true);
            setDisabled(true);
            console.log(props.getValue());
            axios.get(`/api/pull/${props.getSID()}/${props.getValue()}`).then((data) => {
                console.log("request sent");
                console.log(data);
            });
        }
    }

    return (
        <div className={classes.root}>
            <div className={classes.wrapper}>
                <Button
                    variant="contained"
                    color="primary"
                    disabled={loading || disabled}
                    onClick={handleButtonClick}
                >
                    Download Now
                </Button>
                {loading && <CircularProgress size={24}
                                              className={classes.buttonProgress}/>}
            </div>
        </div>
    );
};
export default DownloadButton;