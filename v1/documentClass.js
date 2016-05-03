module.exports = {
  type: 'object',
  objName: 'BaseDocumentClass',
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
    objName: {type: 'string', required: true},
    objDescription: {
      type: ['string', 'object'],
      patternProperies: {
        '^\w\w(-\w\w)?$': {type: 'string'}
      }
    },
    objInterface: {
      type: 'array',
      items: {
        type: 'string'
      },
      minItems: 1
    },
    objSecurity: {
      type: 'object',
      properties: {
        inmutable: {type: 'boolean'},
        locked: {
          type: 'object',
          properties: {
            date: {type: 'string', format: 'date-time', required: true},
            user: {type: 'string', required: true}
          }
        },
        acl: {
          type: 'object',
          patternProperies: {
            '^\w+$': {
              type: 'object',
              properties: {
                write: {type: 'boolean', default: false},
                properties: {
                  type: 'object',
                  patternProperies: {
                    '^\w+$': {type: 'boolean', default: false}
                  }
                }
              }
            }
          }
        }
      },
      required: true
    }
  }
};
