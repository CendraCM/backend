FROM hub.psi.unc.edu.ar/base/nodejs:6.2.2

RUN apt-get update
RUN apt-get install -y python
RUN mkdir -p /opt/project
WORKDIR /opt/project

COPY package.json /opt/project/
RUN npm install
COPY index.js /opt/project
COPY v1 /opt/project/v1
COPY test /opt/project/test
COPY Dockerfile /opt/project/
COPY entrypoint.sh /opt/project/
EXPOSE 80
CMD ["npm", "start"]
