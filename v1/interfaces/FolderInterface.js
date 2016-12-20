module.exports = {
  type: 'object',
  objName: 'FolderInterface',
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
    isCategory: {
      type: 'boolean',
      default: false
    },
    objLinks: {
      type: 'array',
      items: {
        type: 'string',
        objImplements: true
      },
      uniqueItems: true
    }
  }
};
