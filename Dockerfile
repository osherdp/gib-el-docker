FROM python:2

ADD requirements.txt .
RUN pip install -r requirements.txt
ADD . .

CMD gunicorn main -b 0.0.0.0:8000 -t 300
EXPOSE 8000
