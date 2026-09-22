Feature: Authorization gates on candidate submission
  As the ATS
  I want to enforce recruiter, job, and role-access rules before accepting a submission
  So that only authorized recruiters can submit candidates to eligible roles

  Background:
    Given the test data has been reset to the deterministic seed

  @negative
  Scenario: A non-recruiter is forbidden from submitting a candidate
    Given I am authenticated as "u_non_recruiter", who is not a recruiter
    And I have a candidate with a resume on file
    When I submit the candidate to role "job_active"
    Then the response status is 403
    And the response message is "Only recruiters can submit candidates."

  @negative
  Scenario: An unrecognized caller is forbidden from submitting a candidate
    Given I am authenticated as an unknown user id that has no matching account
    And I have a candidate with a resume on file
    When I submit the candidate to role "job_active"
    Then the response status is 403
    And the response message is "Only recruiters can submit candidates."

  @negative
  Scenario Outline: An unreachable role is not found regardless of caller access
    Given I am authenticated as "u_recruiter_direct", a recruiter with direct access to "job_active"
    And I have a candidate with a resume on file
    When I submit the candidate to role "<jobId>"
    Then the response status is 404
    And the response message is "Job not found."

    Examples:
      | jobId         |
      | job_missing   |
      | job_inactive  |
      | job_deleted   |

  @positive
  Scenario: A recruiter with direct role access can submit during an exclusivity window
    Given I am authenticated as "u_recruiter_direct", a recruiter with direct access to "job_exclusive"
    And "job_exclusive" is inside its active exclusivity window
    And I have a candidate with a resume on file
    When I submit the candidate to role "job_exclusive"
    Then the response status is 200

  @negative
  Scenario: A recruiter without direct access is forbidden during an exclusivity window
    Given I am authenticated as "u_recruiter_selfserve", a recruiter with no direct role access
    And "job_exclusive" is inside its active exclusivity window
    And I have a candidate with a resume on file
    When I submit the candidate to role "job_exclusive"
    Then the response status is 403
    And the response message is "This role is currently in an exclusive access period."

  @negative
  Scenario: A self-serve recruiter without access is forbidden from a standard role
    Given I am authenticated as "u_recruiter_selfserve", a self-serve recruiter with no direct role access
    And I have a candidate with a resume on file
    When I submit the candidate to role "job_active"
    Then the response status is 403
    And the response message is "You do not have access to this role."

  @negative
  Scenario: An agency recruiter without access is forbidden from a standard role
    Given I am authenticated as "u_recruiter_agency", an agency recruiter with no direct role access
    And I have a candidate with a resume on file
    When I submit the candidate to role "job_active"
    Then the response status is 403
    And the response message is "Your agency does not have access to this role."

  @positive
  Scenario: A recruiter with an available bypass quota can submit without direct access
    Given I am authenticated as "u_recruiter_bypass1", a recruiter with bypass enabled and quota 1
    And I have a candidate with a resume on file
    When I submit the candidate to role "job_active"
    Then the response status is 200
    And the submission is flagged with "isRoleApprovalBypass" true
    And the recruiter's remaining bypass quota is 0

  @negative
  Scenario: A recruiter with an exhausted bypass quota is forbidden
    Given I am authenticated as "u_recruiter_bypass0", a recruiter with bypass enabled and quota 0
    And I have a candidate with a resume on file
    When I submit the candidate to role "job_active"
    Then the response status is 403
    And the response message is "Role approval bypass quota exhausted."
