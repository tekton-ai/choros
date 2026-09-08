# GitHub operations for Capture

Use GitHub CLI (`gh`) from any agent's command tool. Check installed command help
when a flag is unfamiliar. These operations require an authenticated account;
do not request raw tokens from the user. Keep temporary request files outside
the repository and never write credentials into them.

## Discover the repository and existing records

```sh
git remote -v
gh auth status
gh repo view OWNER/REPO --json nameWithOwner,id,isPrivate,hasDiscussionsEnabled,viewerPermission,url
gh label list --repo OWNER/REPO --limit 100 --json name,color,description
gh issue list --repo OWNER/REPO --state all --search "FEATURE BEHAVIOR" --limit 30 --json number,title,state,url
gh issue view NUMBER --repo OWNER/REPO --json id,number,title,body,labels,state,url
```

Replace uppercase placeholders with observed values. A search with no matches
is not proof that related work does not exist: broaden overly specific terms
and inspect likely candidates. Page label lists if needed; query an exact label
before creating one. Repository `READ` permission alone does not establish
whether every requested operation is allowed: use the actual API permission
response, particularly for label creation and record updates.

For Discussions, use `gh api graphql` to inspect metadata, search, create, update,
and verify. Prefer JSON request files and variables, especially for multiline
text. The JSON request has `query` and `variables` keys; submit it with:

```sh
gh api graphql --input /absolute/path/to/request.json
```

Use a JSON serializer or the agent's file-writing tool to prepare the request.
Do not concatenate unescaped user text into shell commands or GraphQL documents.
Read GraphQL `errors` even when the HTTP response is successful.

Query the repository ID and category IDs immediately before creating a
Discussion. Reuse the returned IDs rather than persisting IDs in the skill:

```graphql
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    id
    isPrivate
    hasDiscussionsEnabled
    discussionCategories(first: 100) {
      nodes { id name slug isAnswerable }
    }
  }
}
```

Search discussions by topic, and read candidates' bodies:

```graphql
query($query: String!, $after: String) {
  search(query: $query, type: DISCUSSION, first: 30, after: $after) {
    nodes { ... on Discussion { id number title body url category { name } } }
    pageInfo { hasNextPage endCursor }
  }
}
```

Set the search variable to repository-scoped terms such as
`repo:OWNER/REPO workflow`. When needed, repeat with the returned cursor.

## Labels and issues

Create only a missing label, after publication is authorized. Recommended colors
for new labels are `d73a4a` for `bug`, `a2eeef` for `feature-request`, and `d4c5f9`
for `brainstorming`; keep existing labels unchanged.

```sh
gh label create "LABEL" --repo OWNER/REPO --color COLOR --description "DESCRIPTION"
gh issue create --repo OWNER/REPO --title "TITLE" --body-file /absolute/path/to/body.md --label "LABEL"
gh issue edit NUMBER --repo OWNER/REPO --add-label "LABEL"
```

Do not use `--force` to overwrite an existing label. If label creation races with
another actor, re-read the label and reuse it. For a title-only update, use
`gh issue edit NUMBER --title "TITLE"`; do not replace the body unnecessarily.
Pass real arguments safely rather than copying these placeholders literally.

### Parent/sub-issue relationship

When the installed CLI exposes `--parent` or `--add-sub-issue`, use those flags
with the observed parent/child issue numbers. Otherwise use the REST API:

```sh
gh api repos/OWNER/REPO/issues/CHILD_NUMBER --jq .id
gh api --method POST repos/OWNER/REPO/issues/PARENT_NUMBER/sub_issues -F sub_issue_id=CHILD_DATABASE_ID
gh api repos/OWNER/REPO/issues/PARENT_NUMBER/sub_issues --paginate
```

`sub_issue_id` is the child's numeric database ID, not its issue number or GraphQL
node ID. Validate the parent and child belong to the intended work. Do not
silently reparent an issue already attached elsewhere. Read the parent's
sub-issues to verify the relationship.

## Create or update a discussion

Set `input` to the observed `repositoryId`, `categoryId`, and the composed
`title` and `body`:

```graphql
mutation($input: CreateDiscussionInput!) {
  createDiscussion(input: $input) {
    discussion { id number title url category { name } }
  }
}
```

Labels are a separate operation. Resolve the exact label's ID:

```graphql
query($owner: String!, $name: String!, $label: String!) {
  repository(owner: $owner, name: $name) {
    label(name: $label) { id name }
  }
}
```

Then add it without replacing existing labels:

```graphql
mutation($recordId: ID!, $labelIds: [ID!]!) {
  addLabelsToLabelable(input: {labelableId: $recordId, labelIds: $labelIds}) {
    clientMutationId
  }
}
```

For updates, use `updateDiscussion(input: $input)` with `UpdateDiscussionInput`:
include `discussionId` and only the requested `title`, `body`, or `categoryId`.
Record creation and labeling are not an atomic operation. If the second fails,
keep the original URL and repair/report that step instead of creating a duplicate.

## Read back the result

For issues, use `gh issue view` with the fields above; for discussions:

```graphql
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    discussion(number: $number) {
      id title body url
      category { name slug }
      labels(first: 100) { nodes { name } }
    }
  }
}
```

Compare saved fields with the intended changes. Preserve previously read labels
and body content when they were outside the requested edit. Check sub-issues
separately when a relationship was requested. Return only verified URLs, never a
constructed URL presented as a successful creation.

## References

- [GitHub Discussions and access](https://docs.github.com/en/discussions/collaborating-with-your-community-using-discussions/about-discussions)
- [GitHub issue forms and default labels](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms)
- [GitHub sub-issues](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues)

Issue Forms are an optional human-facing entrypoint, not a prerequisite for this
skill. Do not create forms, alter repository settings, or publish example
records merely to install or test Capture.
