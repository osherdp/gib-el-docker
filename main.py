import os
import subprocess

import flask


application = flask.Flask(__name__)


@application.route("/")
def index():
    return "Welcome! Use /<repo>/<image>:<tag> to download any docker image"


@application.route("/<repository>/<image>:<tag>")
def fetch(repository, image, tag):
    file_path = "{repo}_{image}.tar".format(repo=repository, image=image)
    try:
        path = "{repo}/{image}:{tag}".format(repo=repository,
                                             image=image,
                                             tag=tag)
        subprocess.check_call(["python", "docker_pull.py", path])

        return flask.send_file(file_path, as_attachment=True)

    finally:
        os.remove(file_path)


if __name__ == "__main__":
    application.run()
