module.exports = {
  type: 'object',
  objName: 'BaseObjectInterface',
  objSecurity: {
    inmutable: true,
    implementable: ['none'],
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
    objIcon: {
      type: 'string'
    },
    objTags: {
      type: 'array',
      items: {
        type: 'string'
      },
      uniqueItems: true,
      minItems: 1
    },
    objInterface: {
      type: 'array',
      items: {
        type: 'string',
        objImplements: true
      },
      minItems: 1,
      uniqueItems: true,
    },
    objSchema: {
      type: 'object',
      patternProperies: {
        '^\w+$': {
          type: 'object'
        }
      }
    },
    objSecurity: {
      type: 'object',
      properties: {
        inmutable: {type: 'boolean'},
        owners: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'string',
            objImplements: {name: 'GroupInterface'}
          },
          uniqueItems: true
        },
        locked: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              format: 'date-time',
              required: true
            },
            user: {
              type: 'string',
              required: true,
              objImplements: {name: 'GroupInterface'}
            }
          }
        },
        acl: {
          type: 'object',
          patternProperies: {
            '^\w+$': {
              type: 'object',
              properties: {
                write: {
                  type: ['boolean', 'array'],
                  items: {
                    type: 'string'
                  },
                  uniqueItems: true,
                  default: false
                },
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
