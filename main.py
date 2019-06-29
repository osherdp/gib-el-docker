import re

from gevent import monkey

IMAGE_TAG_REGEX = \
    r"(?:(?P<repository>[\w\d\-_\.]+)/)?" \
    r"(?P<image>[\w\d\-_\.]+)(?:\:(?P<tag>.+))?"

monkey.patch_all()

import os
import json

import flask
from flask_socketio import SocketIO, emit
from flask_socketio import join_room, leave_room
from flask import render_template, copy_current_request_context, request

from docker import DockerImage

application = flask.Flask(__name__)
application.debug = True
socketio = SocketIO(application, debug=True, async_mode="gevent")


@socketio.on('connect')
def test_message():
    emit('set_sid', {'sid': request.sid})


@socketio.on('changed_sid')
def test_message():
    emit('event', {'data': 'got it!'})


@application.route("/")
def index():
    return render_template("index.html")


@socketio.on('join')
def on_join(data):
    room = data['room']
    join_room(room)
    emit("event", ' has entered the room.', room=room)


@socketio.on('leave')
def on_leave(data):
    room = data['room']
    leave_room(room)
    emit("event", ' has left the room.', room=room)


@application.route("/api/exists/", defaults={"path": ""})
@application.route("/api/exists/<path:path>")
def image_exists(path):
    match = re.match(IMAGE_TAG_REGEX, path)
    if not match:
        return json.dumps({
            "exists": False
        })

    groups = match.groupdict()
    image = groups["image"]
    tag = groups["tag"] \
        if groups["tag"] is not None else "latest"
    repository = groups["repository"] \
        if groups["repository"] is not None else "library"
    return json.dumps({"exists": DockerImage(image=f"{image}:{tag}",
                                             repo=repository).exists()})


@application.route("/api/pull/<room_id>/<path:path>")
def fetch(room_id, path):
    # file_path = "{repo}_{image}.tar".format(repo=repository, image=image)
    match = re.match(IMAGE_TAG_REGEX, path)
    if not match:
        return application.response_class(
            response={
                "status_code": 401,
                "message": "invalid image supplied"
            },
            status=401,
            mimetype='application/json'
        )

    groups = match.groupdict()
    image = groups["image"]
    tag = groups["tag"] \
        if groups["tag"] is not None else "latest"
    repository = groups["repository"] \
        if groups["repository"] is not None else "library"

    @copy_current_request_context
    def download_docker_image(repo, image):
        print("downloading file!")
        docker_image = DockerImage(repo=repo, image=image)
        tar_path = docker_image.tar_path
        for layer_index, total in docker_image.pull():
            emit('pull_progress', {"index": layer_index, "total": total},
                 namespace="/", room=room_id)

        emit("start_compress", {}, namespace="/", room=room_id)
        for line in docker_image.compress():
            emit("compress_progress", {
                "line": str(line)
            }, namespace="/", room=room_id)
        print("pull done!")
        emit('pull_done', {"data": "pull_done!", "tar_path": tar_path},
             namespace="/", room=room_id)

    socketio.start_background_task(download_docker_image, repo=repository,
                                   image=f"{image}:{tag}")
    return application.response_class(
        response={},
        status=201,
        mimetype='application/json'
    )


@application.route("/api/download/<path:file_path>")
def download_file(file_path):
    try:
        return flask.send_file(file_path, as_attachment=True)

    finally:
        os.remove(file_path)


if __name__ == "__main__":
    socketio.run(app=application, debug=True)
