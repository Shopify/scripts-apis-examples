use shopify_function::prelude::*;
use shopify_function::Result;

use serde::{Serialize};

// Use the shopify_function crate to generate structs for the function input and output
generate_types!(
    query_path = "./input.graphql",
    schema_path = "./schema.graphql"
);

// Use the shopify_function crate to declare your function entrypoint
#[shopify_function]
fn function(input: input::ResponseData) -> Result<output::FunctionResult> {
    let no_discount = output::FunctionResult {
        discounts: vec![],
        discount_application_strategy: output::DiscountApplicationStrategy::FIRST,
    };

    // Iterate all the lines in the cart to create discount targets
    let targets = input.cart.lines
        .iter()
        // Only include cart lines with a quantity higher than two
        .filter(|line| line.quantity >= 2)
        // Only include cart lines with a targetable product variant
        .filter_map(|line| match &line.merchandise {
            input::InputCartLinesMerchandise::ProductVariant(variant) => Some(variant),
            input::InputCartLinesMerchandise::CustomProduct => None,
        })
        // Use the variant id to create a discount target
        .map(|variant| output::Target {
            product_variant: Some(output::ProductVariantTarget {
                id: variant.id.to_string(),
                quantity: None,
           })
        })
        .collect::<Vec<output::Target>>();

    if targets.is_empty() {
        return Ok(no_discount);
    }

    // The shopify_function crate serializes your function result and writes it to STDOUT
    Ok(output::FunctionResult {
        discounts: vec![output::Discount {
            message: None,
            targets,
            value: output::Value {
                fixed_amount: None,
                percentage: Some(output::Percentage {
                    value: "10.0".to_string()
                })
            }
        }],
        discount_application_strategy: output::DiscountApplicationStrategy::FIRST,
    })
}

#[cfg(test)]
mod tests;