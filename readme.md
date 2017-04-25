# cfn-template-audit

Read all the CloudFormation templates in an AWS account

## Usage

#### Which statuses are you interested in?

Specify the stack statuses you are interested in auditing as an array. If you don't care, then don't bother. The following statuses will be included in your results:

```js
[
  'CREATE_IN_PROGRESS',
  'CREATE_FAILED',
  'CREATE_COMPLETE',
  'ROLLBACK_IN_PROGRESS',
  'ROLLBACK_FAILED',
  'ROLLBACK_COMPLETE',
  'DELETE_IN_PROGRESS',
  'DELETE_FAILED',
  'UPDATE_IN_PROGRESS',
  'UPDATE_COMPLETE_CLEANUP_IN_PROGRESS',
  'UPDATE_COMPLETE',
  'UPDATE_ROLLBACK_IN_PROGRESS',
  'UPDATE_ROLLBACK_FAILED',
  'UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS',
  'UPDATE_ROLLBACK_COMPLETE',
  'REVIEW_IN_PROGRESS'
]
```

#### What are you looking for inside the templates?

Write a function that accepts _a single template as a string_, and then returns `true` or `false` indicating that it should or should not be included in your results. If you want everything, don't bother with this step.

```js
const templateFilter = template =>
  JSON.parse(template).Resources.SomeResourceName.Type === 'AWS::SNS::Topic';
```

If you need to do any asynchronous I/O to determine which templates to include in the results, simply return a Promise that resolves to a boolean value.

```js
const templateFilter = template =>
  new Promise((resolve, reject) =>
    asynchronousCheck(template, (err, accept) => {
      if (err) return reject(err);
      return resolve(accept); // accept is `true` or `false`
    })
  );
```

#### Roll it up into a script

```js
const audit = require('@mapbox/cfn-template-audit');
const conditions = {
  statuses: ['CREATE_COMPLETE'],
  templateFilter: template =>
    JSON.parse(template).Resources.SomeResourceName.Type === 'AWS::SNS::Topic'
};

audit.getWorldWideTemplates(conditions).then(data =>
  console.log(
    data.map(stack => `${stack.Summary.StackName} ${stack.Region}`)
  );
);
```

If you don't have any conditions (you want to see everything), then just go for it:

```js
audit.getWorldWideTemplates().then(data =>
  console.log(
    data.map(stack => `${stack.Summary.StackName} ${stack.Region}`)
  );
);
```

If you're only interested in a single region, there's a function for that:

```js
audit.getTemplates('us-east-1', conditions).then(data => ...);
```

#### What do I get out of this?

You get back an array of objects with the following properties:

```js
{
  Summary: {
    StackId: 'Unique stack identifier',
    StackName: 'The name associated with the stack',
    TemplateDescription: 'The description of the template used to create the stack',
    CreationTime: 'The time the stack was created',
    LastUpdatedTime: 'The time the stack was last updated',
    DeletionTime: 'The time the stack was deleted',
    StackStatus: 'The current status of the stack',
    StackStatusReason: 'Success/Failure message associated with the stack status'
  },
  TemplateBody: 'The template itself as a string',
  Region: 'The AWS region the template is in'
}
```

The array will be sorted alphabetically by stack name.
