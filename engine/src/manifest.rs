use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

use jsonschema::{Draft, JSONSchema};
use serde_json::Value;

const MANIFEST_SCHEMA_JSON: &str = include_str!("../../contracts/activity-manifest.v1.schema.json");
const TAXONOMY_JSON: &str = include_str!("../../contracts/taxonomy.v1.json");

const SCHEMA_VIOLATION: &str = "SCHEMA_VIOLATION";
const UNKNOWN_TAXONOMY_ID: &str = "UNKNOWN_TAXONOMY_ID";
const EVIDENCE_GROUP_NOT_FOUND: &str = "EVIDENCE_GROUP_NOT_FOUND";
const ADAPTER_POLICY_CONTRADICTION: &str = "ADAPTER_POLICY_CONTRADICTION";
const UNLOCK_INCONSISTENT: &str = "UNLOCK_INCONSISTENT";
const VALUE_OUT_OF_RANGE: &str = "VALUE_OUT_OF_RANGE";
const BAND_SCORE_MISMATCH: &str = "BAND_SCORE_MISMATCH";
const SELF_REFERENCE: &str = "SELF_REFERENCE";
const CONTENT_CONTRACT_VIOLATION: &str = "CONTENT_CONTRACT_VIOLATION";
const ROUTE_METADATA_INVALID: &str = "ROUTE_METADATA_INVALID";
const OBJECTIVE_SKILL_NOT_DECLARED: &str = "OBJECTIVE_SKILL_NOT_DECLARED";
const INVALID_CONTENT_PATH: &str = "INVALID_CONTENT_PATH";
const INVALID_JSON: &str = "INVALID_JSON";

static SCHEMA: OnceLock<Result<JSONSchema, String>> = OnceLock::new();
static TAXONOMY: OnceLock<Result<Taxonomy, String>> = OnceLock::new();

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManifestError {
    pub code: String,
    pub path: String,
    pub message: String,
}

struct Taxonomy {
    version: Option<u64>,
    topics: HashSet<String>,
    modules: HashSet<String>,
    skills: HashSet<String>,
    misconceptions: HashSet<String>,
    common_errors: HashSet<String>,
}

pub fn validate_manifest(manifest_json: &str) -> Result<(), Vec<ManifestError>> {
    let manifest: Value = match serde_json::from_str(manifest_json) {
        Ok(value) => value,
        Err(error) => {
            return Err(vec![ManifestError::new(
                INVALID_JSON,
                "",
                format!("El manifest no contiene JSON válido: {error}"),
            )]);
        }
    };

    let mut errors = Vec::new();
    validate_schema(&manifest, &mut errors);
    validate_semantics(&manifest, &mut errors);

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}

impl ManifestError {
    fn new(code: &str, path: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.to_owned(),
            path: path.into(),
            message: message.into(),
        }
    }
}

fn validate_schema(manifest: &Value, errors: &mut Vec<ManifestError>) {
    match compiled_schema() {
        Ok(schema) => {
            if let Err(schema_errors) = schema.validate(manifest) {
                for error in schema_errors {
                    errors.push(ManifestError::new(
                        SCHEMA_VIOLATION,
                        error.instance_path.to_string(),
                        format!("El manifest no cumple el schema: {error}"),
                    ));
                }
            }
        }
        Err(message) => errors.push(ManifestError::new(
            SCHEMA_VIOLATION,
            "",
            format!("No se pudo cargar el schema del manifest: {message}"),
        )),
    }
}

fn compiled_schema() -> Result<&'static JSONSchema, String> {
    match SCHEMA.get_or_init(|| {
        let schema: Value = serde_json::from_str(MANIFEST_SCHEMA_JSON)
            .map_err(|error| format!("JSON de schema inválido: {error}"))?;
        JSONSchema::options()
            .with_draft(Draft::Draft202012)
            .compile(&schema)
            .map_err(|error| error.to_string())
    }) {
        Ok(schema) => Ok(schema),
        Err(message) => Err(message.clone()),
    }
}

fn embedded_taxonomy() -> Result<&'static Taxonomy, String> {
    match TAXONOMY.get_or_init(|| {
        let value: Value = serde_json::from_str(TAXONOMY_JSON)
            .map_err(|error| format!("JSON de taxonomía inválido: {error}"))?;
        Ok(Taxonomy {
            version: value.get("taxonomyVersion").and_then(Value::as_u64),
            topics: collect_ids(&value, "topics"),
            modules: collect_ids(&value, "modules"),
            skills: collect_ids(&value, "skills"),
            misconceptions: collect_ids(&value, "misconceptions"),
            common_errors: collect_ids(&value, "commonErrors"),
        })
    }) {
        Ok(taxonomy) => Ok(taxonomy),
        Err(message) => Err(message.clone()),
    }
}

fn collect_ids(value: &Value, key: &str) -> HashSet<String> {
    value
        .get(key)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| {
            item.as_str()
                .or_else(|| item.get("id").and_then(Value::as_str))
                .map(str::to_owned)
        })
        .collect()
}

fn validate_semantics(manifest: &Value, errors: &mut Vec<ManifestError>) {
    validate_taxonomy_references(manifest, errors);
    validate_evidence_groups(manifest, errors);
    validate_adapter_policy(manifest, errors);
    validate_unlock_consistency(manifest, errors);
    validate_ranges(manifest, errors);
    validate_band(manifest, errors);
    validate_self_references(manifest, errors);
    validate_content_contract(manifest, errors);
    validate_route(manifest, errors);
    validate_objective_skills(manifest, errors);
    validate_content_paths(manifest, errors);
}

fn validate_taxonomy_references(manifest: &Value, errors: &mut Vec<ManifestError>) {
    let taxonomy = match embedded_taxonomy() {
        Ok(taxonomy) => taxonomy,
        Err(message) => {
            errors.push(ManifestError::new(
                UNKNOWN_TAXONOMY_ID,
                "/compatibility/taxonomyVersion",
                format!("No se pudo cargar la taxonomía: {message}"),
            ));
            return;
        }
    };

    let requested_version = manifest
        .pointer("/compatibility/taxonomyVersion")
        .and_then(Value::as_u64);
    if requested_version.is_some() && requested_version != taxonomy.version {
        errors.push(ManifestError::new(
            UNKNOWN_TAXONOMY_ID,
            "/compatibility/taxonomyVersion",
            "La versión de taxonomía solicitada no está disponible.",
        ));
    }

    for field in ["primaryTopics", "supportTopics", "newTopicFocus"] {
        validate_string_array(
            manifest.get(field),
            &format!("/{field}"),
            &taxonomy.topics,
            "topic",
            errors,
        );
    }
    if let Some(combinations) = manifest.get("combinedTopics").and_then(Value::as_array) {
        for (index, combination) in combinations.iter().enumerate() {
            let Some(combination) = combination.as_str() else {
                continue;
            };
            for topic in combination.split('+') {
                if !taxonomy.topics.contains(topic) {
                    push_unknown(errors, format!("/combinedTopics/{index}"), "topic", topic);
                }
            }
        }
    }

    if let Some(required) = manifest.get("requiredMastery").and_then(Value::as_array) {
        for (index, item) in required.iter().enumerate() {
            let Some(id) = item.get("id").and_then(Value::as_str) else {
                continue;
            };
            let (known, kind) = match item.get("kind").and_then(Value::as_str) {
                Some("topic") => (taxonomy.topics.contains(id), "topic"),
                Some("module") => (taxonomy.modules.contains(id), "módulo"),
                Some("skill") => (taxonomy.skills.contains(id), "skill"),
                _ => (
                    taxonomy.topics.contains(id)
                        || taxonomy.modules.contains(id)
                        || taxonomy.skills.contains(id),
                    "ID de taxonomía",
                ),
            };
            if !known {
                push_unknown(errors, format!("/requiredMastery/{index}/id"), kind, id);
            }
        }
    }

    validate_string_array(
        manifest.get("commonErrors"),
        "/commonErrors",
        &taxonomy.common_errors,
        "error común",
        errors,
    );
    validate_string_array(
        manifest.pointer("/unlock/requiresModules"),
        "/unlock/requiresModules",
        &taxonomy.modules,
        "módulo",
        errors,
    );

    if let Some(items) = manifest.get("skills").and_then(Value::as_array) {
        validate_object_ids(items, "/skills", &taxonomy.skills, "skill", errors);
    }
    if let Some(items) = manifest.get("misconceptions").and_then(Value::as_array) {
        validate_object_ids(
            items,
            "/misconceptions",
            &taxonomy.misconceptions,
            "misconception",
            errors,
        );
        for (index, item) in items.iter().enumerate() {
            if let Some(signals) = item.get("diagnosticSignals").and_then(Value::as_array) {
                for (signal_index, signal) in signals.iter().enumerate() {
                    if let Some(error_id) =
                        signal.as_str().and_then(|text| text.strip_prefix("error:"))
                    {
                        if !taxonomy.common_errors.contains(error_id) {
                            push_unknown(
                                errors,
                                format!("/misconceptions/{index}/diagnosticSignals/{signal_index}"),
                                "error común",
                                error_id,
                            );
                        }
                    }
                }
            }
        }
    }

    walk_taxonomy_references(manifest, "", taxonomy, errors);
}

fn validate_string_array(
    value: Option<&Value>,
    path: &str,
    known_ids: &HashSet<String>,
    kind: &str,
    errors: &mut Vec<ManifestError>,
) {
    let Some(items) = value.and_then(Value::as_array) else {
        return;
    };
    for (index, item) in items.iter().enumerate() {
        if let Some(id) = item.as_str() {
            if !known_ids.contains(id) {
                push_unknown(errors, format!("{path}/{index}"), kind, id);
            }
        }
    }
}

fn validate_object_ids(
    items: &[Value],
    path: &str,
    known_ids: &HashSet<String>,
    kind: &str,
    errors: &mut Vec<ManifestError>,
) {
    for (index, item) in items.iter().enumerate() {
        if let Some(id) = item.get("id").and_then(Value::as_str) {
            if !known_ids.contains(id) {
                push_unknown(errors, format!("{path}/{index}/id"), kind, id);
            }
        }
    }
}

fn walk_taxonomy_references(
    value: &Value,
    path: &str,
    taxonomy: &Taxonomy,
    errors: &mut Vec<ManifestError>,
) {
    match value {
        Value::Object(object) => {
            for (key, child) in object {
                let child_path = format!("{path}/{}", escape_pointer_token(key));
                match key.as_str() {
                    "skillId" => {
                        validate_optional_id(child, &child_path, &taxonomy.skills, "skill", errors)
                    }
                    "skillIds" | "requiredSkillIds" => validate_string_array(
                        Some(child),
                        &child_path,
                        &taxonomy.skills,
                        "skill",
                        errors,
                    ),
                    "misconceptionId" => validate_optional_id(
                        child,
                        &child_path,
                        &taxonomy.misconceptions,
                        "misconception",
                        errors,
                    ),
                    "moduleId" => validate_optional_id(
                        child,
                        &child_path,
                        &taxonomy.modules,
                        "módulo",
                        errors,
                    ),
                    "source" => {
                        if let Some(error_id) =
                            child.as_str().and_then(|text| text.strip_prefix("error:"))
                        {
                            if !taxonomy.common_errors.contains(error_id) {
                                push_unknown(errors, child_path.clone(), "error común", error_id);
                            }
                        }
                    }
                    _ => {}
                }
                walk_taxonomy_references(child, &child_path, taxonomy, errors);
            }
        }
        Value::Array(items) => {
            for (index, child) in items.iter().enumerate() {
                walk_taxonomy_references(child, &format!("{path}/{index}"), taxonomy, errors);
            }
        }
        _ => {}
    }
}

fn validate_optional_id(
    value: &Value,
    path: &str,
    known_ids: &HashSet<String>,
    kind: &str,
    errors: &mut Vec<ManifestError>,
) {
    if let Some(id) = value.as_str() {
        if !known_ids.contains(id) {
            push_unknown(errors, path.to_owned(), kind, id);
        }
    }
}

fn push_unknown(errors: &mut Vec<ManifestError>, path: String, kind: &str, id: &str) {
    errors.push(ManifestError::new(
        UNKNOWN_TAXONOMY_ID,
        path,
        format!("El {kind} '{id}' no existe en la taxonomía declarada."),
    ));
}

fn validate_evidence_groups(manifest: &Value, errors: &mut Vec<ManifestError>) {
    let test_group_ids: HashSet<&str> = manifest
        .pointer("/testContract/testGroups")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|group| group.get("id").and_then(Value::as_str))
        .collect();

    let Some(groups) = manifest
        .pointer("/evidenceContract/groups")
        .and_then(Value::as_array)
    else {
        return;
    };
    for (index, group) in groups.iter().enumerate() {
        let Some(source) = group.get("source").and_then(Value::as_str) else {
            continue;
        };
        if let Some(id) = source.strip_prefix("test-group:") {
            if !test_group_ids.contains(id) {
                errors.push(ManifestError::new(
                    EVIDENCE_GROUP_NOT_FOUND,
                    format!("/evidenceContract/groups/{index}/source"),
                    format!("El grupo de evidencia referencia el test group inexistente '{id}'."),
                ));
            }
        }
    }
}

fn validate_adapter_policy(manifest: &Value, errors: &mut Vec<ManifestError>) {
    let Some(contract) = manifest.get("testContract") else {
        return;
    };
    let policy = contract.get("adapterPolicy").and_then(Value::as_str);
    let allow_adapter = contract.get("allowAdapter").and_then(Value::as_bool);
    let allow_ai_adapter = contract.get("allowAiAdapter").and_then(Value::as_bool);
    let contradiction = match policy {
        Some("forbidden") => allow_adapter != Some(false) || allow_ai_adapter != Some(false),
        Some("prebuilt-reviewed") => allow_adapter != Some(true),
        _ => false,
    };
    if contradiction {
        errors.push(ManifestError::new(
            ADAPTER_POLICY_CONTRADICTION,
            "/testContract/adapterPolicy",
            "La política de adapters contradice allowAdapter o allowAiAdapter.",
        ));
    }
}

fn validate_unlock_consistency(manifest: &Value, errors: &mut Vec<ManifestError>) {
    let Some(prerequisites) = manifest.get("prerequisites").and_then(Value::as_array) else {
        return;
    };
    let Some(unlock_skills) = manifest
        .pointer("/unlock/requiresSkills")
        .and_then(Value::as_array)
    else {
        return;
    };
    if unlock_skills.is_empty() {
        return;
    }

    let unlock_by_id: HashMap<&str, (usize, &Value)> = unlock_skills
        .iter()
        .enumerate()
        .filter_map(|(index, item)| Some((item.get("skillId")?.as_str()?, (index, item))))
        .collect();

    for (index, prerequisite) in prerequisites.iter().enumerate() {
        if prerequisite.get("kind").and_then(Value::as_str) != Some("hard") {
            continue;
        }
        let Some(skill_id) = prerequisite.get("skillId").and_then(Value::as_str) else {
            continue;
        };
        let Some((unlock_index, unlock)) = unlock_by_id.get(skill_id) else {
            errors.push(ManifestError::new(
                UNLOCK_INCONSISTENT,
                format!("/prerequisites/{index}/skillId"),
                format!("El prerequisito hard '{skill_id}' debe estar presente en unlock.requiresSkills."),
            ));
            continue;
        };

        for field in ["minimumMastery", "minimumConfidence"] {
            let prerequisite_value = prerequisite.get(field).and_then(Value::as_f64);
            let unlock_value = unlock.get(field).and_then(Value::as_f64);
            if matches!((prerequisite_value, unlock_value), (Some(base), Some(gate)) if gate > base)
            {
                errors.push(ManifestError::new(
                    UNLOCK_INCONSISTENT,
                    format!("/unlock/requiresSkills/{unlock_index}/{field}"),
                    format!("El umbral de unlock para '{skill_id}' es más exigente que el prerequisito."),
                ));
            }
        }
    }
}

fn validate_ranges(manifest: &Value, errors: &mut Vec<ManifestError>) {
    walk_fraction_ranges(manifest, "", errors);

    let Some(difficulty) = manifest.get("difficulty").and_then(Value::as_object) else {
        return;
    };
    if let Some(score) = difficulty.get("score").and_then(Value::as_f64) {
        if !(0.0..=100.0).contains(&score) {
            push_range_error(errors, "/difficulty/score", 0, 100);
        }
    }
    for field in [
        "conceptualLevel",
        "syntaxLoad",
        "stateControl",
        "loopDepth",
        "functionComplexity",
        "arrayComplexity",
        "matrixComplexity",
        "stringComplexity",
        "pointerDepth",
        "dynamicMemoryRisk",
        "structComplexity",
        "fileIoComplexity",
        "inputParsingComplexity",
        "hiddenTraps",
        "debugDifficulty",
        "algorithmicComplexity",
        "dataFlowComplexity",
        "edgeCaseDensity",
        "noveltyLoad",
        "readingLoad",
        "toolingLoad",
        "interactionComplexity",
    ] {
        if let Some(value) = difficulty.get(field).and_then(Value::as_f64) {
            if !(0.0..=5.0).contains(&value) {
                push_range_error(errors, format!("/difficulty/{field}"), 0, 5);
            }
        }
    }
}

fn walk_fraction_ranges(value: &Value, path: &str, errors: &mut Vec<ManifestError>) {
    match value {
        Value::Object(object) => {
            for (key, child) in object {
                let child_path = format!("{path}/{}", escape_pointer_token(key));
                if matches!(
                    key.as_str(),
                    "weight"
                        | "evidenceStrength"
                        | "confidence"
                        | "minimumMastery"
                        | "minimumConfidence"
                        | "confidenceCeiling"
                        | "starterCompleteness"
                        | "maxEvidencePerAttempt"
                ) {
                    if let Some(number) = child.as_f64() {
                        if !(0.0..=1.0).contains(&number) {
                            push_range_error(errors, &child_path, 0, 1);
                        }
                    }
                }
                walk_fraction_ranges(child, &child_path, errors);
            }
        }
        Value::Array(items) => {
            for (index, child) in items.iter().enumerate() {
                walk_fraction_ranges(child, &format!("{path}/{index}"), errors);
            }
        }
        _ => {}
    }
}

fn push_range_error(
    errors: &mut Vec<ManifestError>,
    path: impl Into<String>,
    minimum: i32,
    maximum: i32,
) {
    errors.push(ManifestError::new(
        VALUE_OUT_OF_RANGE,
        path,
        format!("El valor debe estar entre {minimum} y {maximum}, inclusive."),
    ));
}

fn validate_band(manifest: &Value, errors: &mut Vec<ManifestError>) {
    let Some(score) = manifest
        .pointer("/difficulty/score")
        .and_then(Value::as_i64)
    else {
        return;
    };
    let Some(band) = manifest.pointer("/difficulty/band").and_then(Value::as_str) else {
        return;
    };
    let expected = match score {
        0..=15 => Some("intro"),
        16..=30 => Some("easy"),
        31..=45 => Some("easy+"),
        46..=60 => Some("medium"),
        61..=75 => Some("medium+"),
        76..=90 => Some("hard"),
        91..=100 => Some("challenge"),
        _ => None,
    };
    if expected.is_some_and(|expected_band| expected_band != band) {
        errors.push(ManifestError::new(
            BAND_SCORE_MISMATCH,
            "/difficulty/band",
            format!("La banda '{band}' no corresponde al score {score}."),
        ));
    }
}

fn validate_self_references(manifest: &Value, errors: &mut Vec<ManifestError>) {
    let Some(activity_id) = manifest.get("id").and_then(Value::as_str) else {
        return;
    };
    for field in [
        "remediates",
        "preparesFor",
        "relatedProjects",
        "contrastsWith",
        "alternativeTo",
        "supersedes",
    ] {
        if let Some(relations) = manifest.get(field).and_then(Value::as_array) {
            for (index, relation) in relations.iter().enumerate() {
                if relation.as_str() == Some(activity_id) {
                    push_self_reference(errors, format!("/{field}/{index}"), activity_id);
                }
            }
        }
    }
    for field in ["variantOf", "contentFamily"] {
        if manifest.get(field).and_then(Value::as_str) == Some(activity_id) {
            push_self_reference(errors, format!("/{field}"), activity_id);
        }
    }
}

fn push_self_reference(errors: &mut Vec<ManifestError>, path: String, id: &str) {
    errors.push(ManifestError::new(
        SELF_REFERENCE,
        path,
        format!("La actividad '{id}' no puede referenciarse a sí misma."),
    ));
}

fn validate_content_contract(manifest: &Value, errors: &mut Vec<ManifestError>) {
    let kind = manifest.get("kind").and_then(Value::as_str);
    let content = manifest.get("content");
    if matches!(kind, Some("practice" | "challenge")) {
        if content
            .and_then(|value| value.get("statement"))
            .and_then(Value::as_object)
            .is_none()
        {
            errors.push(ManifestError::new(
                CONTENT_CONTRACT_VIOLATION,
                "/content/statement",
                "Practice y challenge requieren un enunciado.",
            ));
        }
        let has_entrypoint_starter = content
            .and_then(|value| value.get("starter"))
            .and_then(Value::as_array)
            .is_some_and(|starters| {
                starters.iter().any(|starter| {
                    starter.get("role").and_then(Value::as_str) == Some("entrypoint")
                })
            });
        if !has_entrypoint_starter {
            errors.push(ManifestError::new(
                CONTENT_CONTRACT_VIOLATION,
                "/content/starter",
                "Practice y challenge requieren al menos un starter con role entrypoint.",
            ));
        }
    }

    let Some(entrypoint) = manifest
        .pointer("/execution/entrypoint")
        .and_then(Value::as_str)
    else {
        return;
    };
    let mut content_paths = Vec::new();
    if let Some(content) = content {
        collect_content_paths(content, &mut content_paths);
    }
    if !content_paths.contains(&entrypoint) {
        errors.push(ManifestError::new(
            CONTENT_CONTRACT_VIOLATION,
            "/execution/entrypoint",
            format!("El entrypoint '{entrypoint}' no está declarado en content."),
        ));
    }
}

fn collect_content_paths<'a>(value: &'a Value, paths: &mut Vec<&'a str>) {
    match value {
        Value::Object(object) => {
            if let Some(path) = object.get("path").and_then(Value::as_str) {
                paths.push(path);
            }
            for child in object.values() {
                collect_content_paths(child, paths);
            }
        }
        Value::Array(items) => {
            for child in items {
                collect_content_paths(child, paths);
            }
        }
        _ => {}
    }
}

fn validate_route(manifest: &Value, errors: &mut Vec<ManifestError>) {
    let Some(route) = manifest.get("route") else {
        return;
    };
    let eligible = route.get("routeEligible").and_then(Value::as_bool);
    let route_id = route.get("routeId").and_then(Value::as_str);
    let module_id = route.get("moduleId").and_then(Value::as_str);
    let order = route.get("orderInModule").and_then(Value::as_i64);

    let has_assignment = route_id.is_some() || module_id.is_some() || order.is_some();
    let invalid = order.is_some_and(|value| value < 1)
        || (has_assignment
            && (eligible != Some(true) || route_id.is_none() || module_id.is_none()))
        || (eligible == Some(true) && (route_id.is_none() || module_id.is_none()));
    if invalid {
        errors.push(ManifestError::new(
            ROUTE_METADATA_INVALID,
            "/route",
            "orderInModule debe ser >= 1 y solo puede declararse con routeEligible=true, routeId y moduleId.",
        ));
    }
}

fn validate_objective_skills(manifest: &Value, errors: &mut Vec<ManifestError>) {
    let declared: HashSet<&str> = manifest
        .get("skills")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|skill| skill.get("id").and_then(Value::as_str))
        .collect();
    let Some(objectives) = manifest.get("learningObjectives").and_then(Value::as_array) else {
        return;
    };
    for (objective_index, objective) in objectives.iter().enumerate() {
        let Some(skill_ids) = objective.get("skillIds").and_then(Value::as_array) else {
            continue;
        };
        for (skill_index, skill_id) in skill_ids.iter().enumerate() {
            if let Some(skill_id) = skill_id.as_str() {
                if !declared.contains(skill_id) {
                    errors.push(ManifestError::new(
                        OBJECTIVE_SKILL_NOT_DECLARED,
                        format!("/learningObjectives/{objective_index}/skillIds/{skill_index}"),
                        format!("La skill '{skill_id}' del objetivo no está declarada en skills."),
                    ));
                }
            }
        }
    }
}

fn validate_content_paths(manifest: &Value, errors: &mut Vec<ManifestError>) {
    let Some(content) = manifest.get("content") else {
        return;
    };
    walk_content_paths(content, "/content", errors);
}

fn walk_content_paths(value: &Value, path: &str, errors: &mut Vec<ManifestError>) {
    match value {
        Value::Object(object) => {
            for (key, child) in object {
                let child_path = format!("{path}/{}", escape_pointer_token(key));
                if key == "path" {
                    if let Some(content_path) = child.as_str() {
                        if !is_safe_content_path(content_path) {
                            errors.push(ManifestError::new(
                                INVALID_CONTENT_PATH,
                                child_path.clone(),
                                format!("El path de content '{content_path}' debe ser relativo y no puede contener '..' ni backslashes."),
                            ));
                        }
                    }
                }
                walk_content_paths(child, &child_path, errors);
            }
        }
        Value::Array(items) => {
            for (index, child) in items.iter().enumerate() {
                walk_content_paths(child, &format!("{path}/{index}"), errors);
            }
        }
        _ => {}
    }
}

fn is_safe_content_path(path: &str) -> bool {
    !path.is_empty()
        && !path.starts_with('/')
        && !path.starts_with('\\')
        && !path.contains('\\')
        && !path.contains(':')
        && !path.split('/').any(|component| component == "..")
}

fn escape_pointer_token(token: &str) -> String {
    token.replace('~', "~0").replace('/', "~1")
}
