FROM hub.psi.unc.edu.ar/base/nodejs:5.11.0

RUN mkdir -p /opt/project
WORKDIR /opt/project

COPY Dockerfile /opt/project/
COPY package.json /opt/project/
RUN npm install
COPY index.js /opt/project
COPY v1 /opt/project/v1
COPY test /opt/project/test
CMD ["npm", "start"]
