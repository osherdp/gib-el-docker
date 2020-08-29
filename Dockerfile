FROM python:3.7-alpine

WORKDIR /app
RUN apk add --no-cache --virtual .build-deps gcc musl-dev pv
ADD requirements.txt .
RUN pip install -r requirements.txt
ADD . .

CMD gunicorn main:application -b 0.0.0.0:$PORT -t 300 -w 1 --threads 3 --worker-class gevent --preload
EXPOSE 8000