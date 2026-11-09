export type ExpressionVariable = {
    name: string;
    description: string;
  };
  
  export type ExpressionFunction = {
    name: string;
    signature: string;
    description: string;
  };
  
  // These lists feed the editor autocomplete today.
  // The resolver (Tasks 45-47) must support exactly the same names.
  export const expressionVariables: ExpressionVariable[] = [
    { name: 'input', description: 'Output of the previous node' },
    { name: 'trigger', description: 'Data the run was started with' },
  ];
  
  export const expressionFunctions: ExpressionFunction[] = [
    {
      name: 'json',
      signature: 'json(value)',
      description: 'Convert a value to a JSON string',
    },
    {
      name: 'upper',
      signature: 'upper(text)',
      description: 'Make text UPPERCASE',
    },
    {
      name: 'lower',
      signature: 'lower(text)',
      description: 'Make text lowercase',
    },
    {
      name: 'length',
      signature: 'length(value)',
      description: 'Length of a text or a list',
    },
    {
      name: 'default',
      signature: 'default(value, fallback)',
      description: 'Use the fallback when the value is empty',
    },
    {
      name: 'now',
      signature: 'now()',
      description: 'Current time as text',
    },
  ];