'use strict';

const AWS = require('aws-sdk');
const Queue = require('p-queue');

/**
 * Summaries of every stack in a region
 *
 * @param {string} region - the AWS region to audit
 * @param {array} [StackStatusFilter] - an array of stack status values to audit
 * @returns
 */
const listStacks = (region, StackStatusFilter) => {
  StackStatusFilter = StackStatusFilter || [
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
  ];

  return new Promise((resolve, reject) => {
    const cfn = new AWS.CloudFormation({ region });
    let stacks = [];

    cfn.listStacks({ StackStatusFilter }).eachPage((err, data, done) => {
      if (err) return reject(err);
      if (!data) return resolve(stacks);
      stacks = stacks.concat(data.StackSummaries);
      done();
    });
  });
};

/**
 * Get stack summaries and templates matching a set of conditions in a single
 * region. If no conditions are specified, all stacks will be audited.
 *
 * @param {string} region - the AWS region to audit
 * @param {object} [conditions] - defines filtering criteria
 * @param {array} [conditions.statuses=any] - an array of stack status values to
 * @param {function} [conditions.templateFilter=None] - a function that accepts
 * one template (as a string), and returns true/false (or a Promise that resolves
 * to true/false) indicating whether or not to return the template in the response
 * @param {string} [conditions.stage=Processed] - for templates that include
 * transforms, the stage of the template to return (`Original` or `Processed`).
 * @returns
 */
const getTemplates = (region, conditions) => {
  conditions = conditions || {};
  const TemplateStage = conditions.stage || 'Processed';

  const filterer = conditions.templateFilter
    ? template =>
        Promise.resolve().then(() => conditions.templateFilter(template))
    : () => Promise.resolve(true);

  return listStacks(region, conditions.statuses).then(summaries => {
    const cfn = new AWS.CloudFormation({ region });
    const queue = new Queue({ concurrency: 1 });
    const requests = summaries.map(summary =>
      cfn.getTemplate({
        StackName: summary.StackName,
        TemplateStage
      })
    );

    const promises = requests.map(req => {
      const checkTemplate = () =>
        req
          .promise()
          .then(data =>
            filterer(data.TemplateBody).then(accept => {
              return accept ? data.TemplateBody : null;
            })
          )
          .catch(err => {
            if (err.code === 'AccessDenied') return Promise.resolve(null);
            throw err;
          });

      return queue.add(checkTemplate);
    });

    return Promise.all(promises).then(results =>
      results
        .map((TemplateBody, i) => ({
          TemplateBody,
          Summary: summaries[i],
          Region: region
        }))
        .filter(data => data.TemplateBody)
        .sort((a, b) => {
          return `${a.Summary.StackName}-${a.Region}` >
            `${b.Summary.StackName}-${b.Region}`
            ? 1
            : -1;
        })
    );
  });
};

/**
* Get stack summaries and templates matching a set of conditions in all
* regions. If no conditions are specified, all stacks will be audited.
*
* @param {object} [conditions] - defines filtering criteria
* @param {array} [conditions.statuses=any] - an array of stack status values to
* @param {function} [conditions.templateFilter=None] - a function that accepts
* one template (as a string), and returns true/false (or a Promise that resolves
* to true/false) indicating whether or not to return the template in the response
* @param {string} [conditions.stage=Processed] - for templates that include
* transforms, the stage of the template to return (`Original` or `Processed`).
 */
const getWorldWideTemplates = conditions => {
  const queue = new Queue({ concurrency: 5 });
  const regions = [
    'us-east-1',
    'us-east-2',
    'us-west-1',
    'us-west-2',
    'ca-central-1',
    'ap-south-1',
    'ap-northeast-1',
    'ap-northeast-2',
    'ap-southeast-1',
    'ap-southeast-2',
    'eu-central-1',
    'eu-west-1',
    'eu-west-2',
    'sa-east-1'
  ];

  return Promise.all(
    regions.map(region => queue.add(() => getTemplates(region, conditions)))
  ).then(results =>
    results.reduce((final, regional) => final.concat(regional), [])
  );
};

module.exports = { getTemplates, getWorldWideTemplates };
