# Privacy

ControlCurrent is designed to avoid collecting visitor or target data.

## Information collected

The deployed application collects no information. It has no:

- analytics or advertising;
- user account;
- form submission;
- application server;
- runtime API;
- browser fingerprinting;
- user-agent detection;
- website scanner;
- telemetry endpoint.

Static hosting infrastructure may produce its own ordinary delivery logs. Those
logs are outside ControlCurrent's application architecture and are not consumed
by the project.

## Deployment profiles

Profile calculations run in the browser.

By default, a profile exists only in page memory. Selecting **Save locally**
writes the profile to one key:

```text
controlcurrent.profile.v1
```

The value is:

- versioned;
- limited to 4,096 bytes;
- limited to nine explicit browser minimums;
- never sent to a server;
- never included in analytics;
- clearable from the planner.

Future-version values are left untouched and refused rather than migrated
silently. Invalid and oversized values are ignored.

## Exports

JSON exports are generated locally from the displayed calculation. They contain
the selected browser profile, BCD version, catalogue version, and calculated
results. They contain no visitor identifier or browser telemetry.

## Offline header assessment

Pasted response headers remain in page memory. ControlCurrent does not fetch a
URL, upload the text, save it to local storage, or include raw header values in
the calculated report. Clear removes the textarea and report from the page.

Request credentials such as `Authorization` and `Cookie` are refused. A
`Set-Cookie` field can be parsed to count security attributes, but reports omit
cookie names and values. Replace values and other secrets with `REDACTED`
before pasting because the browser still has to hold the input temporarily to
parse it.

## Source data

The compatibility dataset contains public technical facts from MDN BCD and Web
Platform Features and no visitor or target information.

## Deletion

Use **Clear saved profile** in the planner or clear the site's storage in the
browser. There is no application-side server copy.
