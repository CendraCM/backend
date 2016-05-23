module.exports = {
  type: 'object',
  objName: 'UserInterface',
  objSecurity: {
    inmutable: true,
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
    externalId: {
      type: 'array',
      items: {
        type: 'string'
      },
      minItems: 1,
      required: true
    }
  }
};
