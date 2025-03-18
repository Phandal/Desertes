import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { X12Deserializer } from '#translation/deserializer.js';
import { Template } from '#translation/types.js';

describe('X12Deserializer deserialize method', () => {
  it('should deserialize a document into an edi object from a template', () => {
    const input = 'ISA*00~GS*01~ST*834~';

    const deserializeTemplate: Template = {
      $schema: '',
      name: '',
      version: '0.0.1',
      elementSeparator: '*',
      segmentSeparator: '~',
      componentSeparator: '>',
      repetitionSeparator: '!',
      rules: [
        {
          name: 'ISA',
          container: false,
          elements: [
            {
              name: 'ISA_Segment',
              value: 'ISA',
            },
            {
              name: 'Authorization_Information_Qualifier',
              value: 'ISA01',
            },
          ],
          children: [
            {
              name: 'GS',
              container: false,
              elements: [
                {
                  name: 'GS_Segment',
                  value: 'GS',
                },
                {
                  name: 'Functional_Identifier_Code',
                  value: 'GS01',
                },
              ],
              children: [
                {
                  name: 'ST_Loop',
                  container: true,
                  children: [
                    {
                      name: 'ST',
                      container: false,
                      elements: [
                        {
                          name: 'ST_Segment',
                          value: 'ST',
                        },
                        {
                          name: 'Transaction_Set_Identifier_Code',
                          value: 'ST01',
                        },
                      ],
                      children: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const want = {
      ISA: [
        {
          ISA_Segment: 'ISA',
          Authorization_Information_Qualifier: 'ISA01',
          GS: [
            {
              GS_Segment: 'GS',
              Functional_Identifier_Code: 'GS01',
              ST_Loop: [
                {
                  ST: [
                    {
                      ST_Segment: 'ST',
                      Transaction_Set_Identifier_Code: 'ST01',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const deserializer = new X12Deserializer(input, deserializeTemplate);
    const got = deserializer.deserialize();

    assert.deepEqual(got, want);
  });

  it('should be able to deserialize 2 sibling segments with the same header', () => {
    const input = 'ISA_first*01~ISA_second*02~';

    const deserializeSiblingTemplate: Template = {
      $schema: '',
      name: '',
      version: '0.0.1',
      elementSeparator: '*',
      segmentSeparator: '~',
      componentSeparator: '>',
      repetitionSeparator: '!',
      rules: [
        {
          name: 'ISA',
          container: false,
          elements: [
            {
              name: 'ISA_Segment',
              value: 'ISA',
            },
            {
              name: 'Authorization_Information_Qualifier',
              value: '00',
            },
          ],
          children: [],
        },
      ],
    };

    const want = {
      ISA: [
        {
          ISA_Segment: 'ISA',
          Authorization_Information_Qualifier: '00',
        },
        {
          ISA_Segment: 'ISA',
          Authorization_Information_Qualifier: '00',
        },
      ],
    };

    const deserializer = new X12Deserializer(input, deserializeSiblingTemplate);
    const got = deserializer.deserialize();

    assert.deepEqual(got, want);
  });

  it('should be able to deserialize with handlebars replacements', () => {
    const input = 'Jack,Smith,26,111-22-3333\nJohn,Apple,38,444-55-6666\n';

    const template: Template = {
      $schema: '',
      name: '',
      version: '0.0.1',
      elementSeparator: ',',
      segmentSeparator: '\n',
      componentSeparator: '::::::::',
      repetitionSeparator: '!!!!!!!!',
      rules: [
        {
          name: 'Row_Data',
          container: false,
          elements: [
            {
              name: 'FirstName',
              value: '{{_v}}',
            },
            {
              name: 'LastName',
              value: '{{_v}}',
            },
            {
              name: 'Age',
              value: '{{_v}}',
            },
            {
              name: 'SSN',
              value: `{{ssnFormat 'nodash' _v}}`,
            },
          ],
          children: [],
        },
      ],
    };

    const want = {
      Row_Data: [
        {
          FirstName: 'Jack',
          LastName: 'Smith',
          Age: '26',
          SSN: '111223333',
        },
        {
          FirstName: 'John',
          LastName: 'Apple',
          Age: '38',
          SSN: '444556666',
        },
      ],
    };

    const deserializer = new X12Deserializer(input, template);
    const got = deserializer.deserialize();

    assert.deepEqual(got, want);
  });

  it('should be able to deserialize with attributes', () => {
    const input = 'Jack,Smith,26,111-22-3333\nJohn,Apple,38,444-55-6666\n';

    const template: Template = {
      $schema: '',
      name: '',
      version: '0.0.1',
      elementSeparator: ',',
      segmentSeparator: '\n',
      componentSeparator: '::::::::',
      repetitionSeparator: '!!!!!!!!',
      rules: [
        {
          name: 'Row_Data',
          container: false,
          elements: [
            {
              name: 'FirstName',
              value: '{{_v}}',
              attributes: {
                length: {
                  min: 20,
                  max: 20,
                  padding: '0',
                },
              },
            },
            {
              name: 'LastName',
              value: '{{_v}}',
              attributes: {
                length: {
                  min: 0,
                  max: 2,
                },
              },
            },
            {
              name: 'Age',
              value: `{{#compare _v '<=' '30'}}too_young{{else}}old_enough{{/compare}}`,
            },
            {
              name: 'SSN',
              value: `{{ssnFormat 'nodash' _v}}`,
            },
          ],
          children: [],
        },
      ],
    };

    const want = {
      Row_Data: [
        {
          FirstName: 'Jack0000000000000000',
          LastName: 'Sm',
          Age: 'too_young',
          SSN: '111223333',
        },
        {
          FirstName: 'John0000000000000000',
          LastName: 'Ap',
          Age: 'old_enough',
          SSN: '444556666',
        },
      ],
    };

    const deserializer = new X12Deserializer(input, template);
    const got = deserializer.deserialize();

    assert.deepEqual(got, want);
  });
});
