use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LastState {
    pub(crate) last_mode: Option<String>,
    pub(crate) last_route_id: Option<String>,
    pub(crate) last_module_id: Option<String>,
    pub(crate) last_exercise_id: Option<String>,
    pub(crate) updated_at: String,
}

#[derive(Debug)]
pub(crate) enum PatchField {
    Keep,
    Set(Option<String>),
}

impl PatchField {
    pub(crate) fn should_apply(&self) -> i64 {
        match self {
            Self::Keep => 0,
            Self::Set(_) => 1,
        }
    }

    pub(crate) fn value(&self) -> Option<&str> {
        match self {
            Self::Set(Some(value)) => Some(value),
            Self::Keep | Self::Set(None) => None,
        }
    }
}

#[derive(Debug)]
pub(crate) struct StatePatch {
    pub(crate) last_mode: PatchField,
    pub(crate) last_route_id: PatchField,
    pub(crate) last_module_id: PatchField,
    pub(crate) last_exercise_id: PatchField,
}

impl StatePatch {
    pub(crate) fn from_params(params: &Value) -> Result<Self, ()> {
        let fields = params.as_object().ok_or(())?;
        let mut patch = Self {
            last_mode: PatchField::Keep,
            last_route_id: PatchField::Keep,
            last_module_id: PatchField::Keep,
            last_exercise_id: PatchField::Keep,
        };

        for (name, value) in fields {
            let parsed = parse_patch_field(value)?;
            match name.as_str() {
                "lastMode" => patch.last_mode = parsed,
                "lastRouteId" => patch.last_route_id = parsed,
                "lastModuleId" => patch.last_module_id = parsed,
                "lastExerciseId" => patch.last_exercise_id = parsed,
                _ => return Err(()),
            }
        }

        Ok(patch)
    }
}

fn parse_patch_field(value: &Value) -> Result<PatchField, ()> {
    match value {
        Value::Null => Ok(PatchField::Set(None)),
        Value::String(value) => Ok(PatchField::Set(Some(value.clone()))),
        _ => Err(()),
    }
}
