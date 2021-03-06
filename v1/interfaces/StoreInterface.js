module.exports = {
  type: 'object',
  objName: 'StoreInterface',
  objIcon: 'cloud',
  objSecurity: {
    inmutable: true,
    implementable: ['any'],
    acl: {
      "group:public": {
        write: false,
        properties: {
          "properties:all": false
        }
      }
    }
  },
  properties: {
    baseUrl: {
      type: 'string',
      required: true
    }
  }
};
