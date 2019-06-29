import gzip
import hashlib
import json
import os
import shutil
import sys
import tarfile
from io import BytesIO

import urllib3
import requests

from six.moves import http_client
from cached_property import cached_property

urllib3.disable_warnings()

EMPTY_JSON = {"created": "1970-01-01T00:00:00Z",
              "container_config": {"Hostname": "", "Domainname": "", "User": "",
                                   "AttachStdin": False,
                                   "AttachStdout": False, "AttachStderr": False,
                                   "Tty": False, "OpenStdin": False,
                                   "StdinOnce": False, "Env": None, "Cmd": None,
                                   "Image": "",
                                   "Volumes": None, "WorkingDir": "",
                                   "Entrypoint": None, "OnBuild": None,
                                   "Labels": None}}


class URLRequestError(RuntimeError):
    def __init__(self, message, response):
        super(URLRequestError, self).__init__(message)
        self.response = response


class ImageLayer(object):
    def __init__(self, image, digest, parent_id):
        self.image = image
        self.digest = digest
        self.parent_id = parent_id

    @cached_property
    def hash(self):
        return self.digest[7:19]

    @cached_property
    def fake_layerid(self):
        return hashlib.sha256(
            f"{self.parent_id}\n{self.digest}\n".encode("ascii")).hexdigest()

    @cached_property
    def layer_dir(self):
        layer_dir = f"{self.image.imgdir}/{self.fake_layerid}"
        if not os.path.exists(layer_dir):
            os.mkdir(layer_dir)

        return layer_dir

    @cached_property
    def blob(self):
        print(f"Pulling blob: {self.hash}...", end="")
        sys.stdout.flush()
        download_blob_response = self.image.request(
            url=f"https://registry-1.docker.io/v2/{self.image.repository}/"
            f"blobs/{self.digest}",
            error_msg=f'\rERROR: Cannot download layer {self.hash}'
        )
        length = download_blob_response.headers['Content-Length']
        print(f" done! [{length}B]")
        return download_blob_response.content

    @cached_property
    def tar_path(self):
        return f"{self.layer_dir}/layer.tar"

    @cached_property
    def relative_tar_path(self):
        return f"{self.fake_layerid}/layer.tar"

    def write(self):
        with open(f"{self.layer_dir}/VERSION", 'w') as version_file:
            version_file.write('1.0')

        with open(self.tar_path, "wb") as layer_file:
            mybuff = BytesIO(self.blob)
            unzLayer = gzip.GzipFile(fileobj=mybuff)
            while True:
                chunk = unzLayer.read(1024)
                if not chunk:
                    break

                layer_file.write(chunk)

            unzLayer.close()

        with open(f"{self.layer_dir}/json", 'w') as json_file:
            if self.image.last_layer.digest == self.digest:
                # FIXME: json.loads() automatically converts to unicode, thus decoding values whereas Docker doesn't
                json_obj = json.loads(self.image.blobs.content)
                del json_obj['history']
                del json_obj['rootfs']
            else:  # other layers json are empty
                json_obj = EMPTY_JSON
            json_obj['id'] = self.fake_layerid
            if self.parent_id:
                json_obj['parent'] = self.parent_id
            json_file.write(json.dumps(json_obj))


class DockerImage(object):

    def __init__(self, image, repo="library"):
        self.image_name, self.tag = image.split(":")
        self.repo = repo

        self.repository = '{}/{}'.format(self.repo, self.image_name)

    def exists(self):
        return requests.get(f"https://index.docker.io/v1/repositories/{self.repository}/tags/{self.tag}").status_code == int(http_client.OK)

    @cached_property
    def manifest(self):
        resp = self.request(
            url=f'https://registry-1.docker.io/v2/{self.repository}/manifests/'
            f'{self.tag}',
            error_msg=f'Cannot fetch manifest for {self.repository}'
        )

        return resp.json()

    @property
    def layers_manifest(self):
        return self.manifest["layers"]

    @cached_property
    def layers(self):
        layers = []
        parent_id = ""
        for layer in self.layers_manifest:
            layer_digest = layer['digest']
            layer_class = ImageLayer(image=self,
                                     digest=layer_digest,
                                     parent_id=parent_id)
            parent_id = layer_digest
            layers.append(layer_class)

        return layers

    @property
    def layers_paths(self):
        return [layer.relative_tar_path for layer in self.layers]

    @property
    def last_layer(self):
        return self.layers[-1]

    @property
    def digest(self):
        return self.manifest["config"]["digest"]

    @property
    def hash(self):
        return self.digest[7:]

    @cached_property
    def access_token(self):
        response = requests.get(
            'https://auth.docker.io/token?'
            'service=registry.docker.io&'
            f'scope=repository:{self.repository}:pull')

        return response.json()['access_token']

    @cached_property
    def auth_header(self):
        return {
            'Authorization': f'Bearer {self.access_token}',
            'Accept': 'application/vnd.docker.distribution.manifest.v2+json'
        }

    def request(self, url, error_msg=None):
        resp = requests.get(url, headers=self.auth_header)
        if resp.status_code != int(http_client.OK):
            raise URLRequestError(error_msg, resp)

        return resp

    @cached_property
    def imgdir(self):
        if not os.path.exists("downloads"):
            os.mkdir("downloads")
        imgdir = 'downloads/tmp_{}_{}'.format(self.image_name, self.tag)
        if not os.path.exists(imgdir):
            os.mkdir(imgdir)
        return imgdir

    @cached_property
    def blobs(self):
        return self.request(
            url=f"https://registry-1.docker.io/v2/{self.repository}/blobs/"
            f"{self.digest}"
        )

    @cached_property
    def tar_path(self):
        return "downloads/" + self.repo + '_' + self.image_name + ":" + self.tag + '.tar'

    def pull(self):
        print('Creating image structure in: ' + self.imgdir)
        with open('{}/{}.json'.format(self.imgdir, self.hash),
                  'wb') as blobs_file:
            blobs_file.write(self.blobs.content)

        yield from self.pull_layers()
        with open(self.imgdir + '/manifest.json', 'w') as manifest_file:
            manifest_file.write(json.dumps([
                {
                    'Config': self.hash + '.json',
                    'RepoTags': [self.repository + ':' + self.tag],
                    'Layers': self.layers_paths
                }
            ]))

        with open(self.imgdir + '/repositories', 'w') as repositories_file:
            repositories_file.write(
                json.dumps({
                    self.repository: {
                        self.tag: self.last_layer.fake_layerid
                    }
                }))

        # Create image tar and clean tmp folder
        docker_tar = self.tar_path
        tar = tarfile.open(docker_tar, "w")
        tar.add(self.imgdir, arcname=os.path.sep)
        tar.close()

        shutil.rmtree(self.imgdir)
        print('Docker image pulled: ' + docker_tar)

    def pull_layers(self):
        total = len(self.layers)
        for index, layer in enumerate(self.layers):
            print(f"Layer {index + 1}/{total} - ", end="")
            yield index, total
            layer.write()


if __name__ == '__main__':
    abc = DockerImage("ubuntu:16.04")
    abc.pull()
