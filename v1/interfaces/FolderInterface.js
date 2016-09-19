module.exports = {
  type: 'object',
  objName: 'FolderInterface',
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
    isCategory: {
      type: 'boolean',
      default: false
    },
    objLinks: {
      type: 'array',
      items: {
        type: 'string'
      }
    }
  }
};
