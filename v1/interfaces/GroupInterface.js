module.exports = {
  type: 'object',
  objName: 'GroupInterface',
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
    personalGroup: {
      type: 'boolean',
      default: false
    },
    rootGroup: {
      type: 'boolean',
      default: false
    },
    objLinks: {
      type: 'array',
      items: {
        type: 'string',
        objImplements: {name: 'UserInterface'}
      }
    }
  }
};
